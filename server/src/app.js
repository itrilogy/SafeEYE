const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const multer = require('multer');
const { initDB, getDB } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// 诊断路由：确保后端逻辑已加载
app.get('/api/ping', (req, res) => res.send('pong'));

// 路径宏定义
const DIR_RAW = path.join(__dirname, '../data/assets/raw');
const DIR_META = path.join(__dirname, '../data/assets/meta');
const DIR_RECORDS = path.join(__dirname, '../data/sessions/records');
const DIR_EXAMS = path.join(__dirname, '../data/exams');

// multer 上传配置
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        await fs.mkdir(DIR_RAW, { recursive: true });
        cb(null, DIR_RAW);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext);
        cb(null, `${base}-${uniqueSuffix}${ext}`);
    }
});
const upload = multer({ storage: storage });

// 1. 静态引流
app.use('/assets/raw', express.static(DIR_RAW));

// 2. 获取所有的图片列表（来自数据库）
app.get('/api/assets', async (req, res) => {
    try {
        const db = getDB();
        const assets = db.prepare(`
            SELECT a.*, 
            (SELECT json_group_array(json_object('id', id, 'shape', shape, 'rect', json_object('x', x, 'y', y, 'w', w, 'h', h), 'clauseId', clause_id, 'scoreWeight', score_weight, 'description', description))
             FROM annotations WHERE asset_id = a.id) as annotations_json
            FROM assets a
            ORDER BY upload_time DESC
        `).all();

        const data = assets.map(a => ({
            name: a.id,
            url: a.path,
            baseName: path.basename(a.id, path.extname(a.id)),
            isAnnotated: a.is_annotated === 1,
            meta: { items: JSON.parse(a.annotations_json || '[]') }
        }));

        res.json({ status: "success", data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. 上传新图片 (同步写入数据库)
app.post('/api/assets/upload', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '没有上传任何文件' });

    try {
        const db = getDB();
        const filename = req.file.filename;
        db.prepare('INSERT INTO assets (id, filename, path, upload_time) VALUES (?, ?, ?, ?)')
            .run(filename, filename, `/assets/raw/${filename}`, Date.now());

        res.json({ status: "success", file: filename });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3.5 删除图片及所有关联数据 (物理 + 数据库)
app.delete('/api/assets/:filename', async (req, res) => {
    try {
        const db = getDB();
        const filename = req.params.filename;

        // DB 级联删除
        const deleteAsset = db.prepare('DELETE FROM assets WHERE id = ?');
        const deleteAnnos = db.prepare('DELETE FROM annotations WHERE asset_id = ?');
        const deleteExamItems = db.prepare('DELETE FROM exam_items WHERE asset_id = ?');

        db.transaction(() => {
            deleteAnnos.run(filename);
            deleteExamItems.run(filename);
            deleteAsset.run(filename);
        })();

        // 物理文件删除
        const filePath = path.join(DIR_RAW, filename);
        try {
            await fs.unlink(filePath);
        } catch (fileErr) {
            console.warn(`[Warn] Physical file not found or already deleted: ${filePath}`);
        }

        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. 获取特定图片的标注元数据
app.get('/api/assets/meta/:imgName', async (req, res) => {
    try {
        const db = getDB();
        const assetId = req.params.imgName;
        const annos = db.prepare('SELECT * FROM annotations WHERE asset_id = ?').all(assetId);

        const items = annos.map(a => ({
            id: a.id,
            shape: a.shape,
            rect: { x: a.x, y: a.y, w: a.w, h: a.h },
            clauseId: a.clause_id,
            scoreWeight: a.score_weight,
            description: a.description
        }));

        res.json({ status: "success", meta: { sceneId: assetId, items } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. 保存图片的标注配置信息 (先删后增，事务处理)
app.post('/api/assets/meta/:imgName', async (req, res) => {
    const db = getDB();
    const assetId = req.params.imgName;
    const items = req.body.items || [];

    const deleteStmt = db.prepare('DELETE FROM annotations WHERE asset_id = ?');
    const insertStmt = db.prepare('INSERT INTO annotations (id, asset_id, shape, x, y, w, h, clause_id, score_weight, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const updateAssetStmt = db.prepare('UPDATE assets SET is_annotated = ? WHERE id = ?');

    const runTransaction = db.transaction((annos) => {
        deleteStmt.run(assetId);
        for (const a of annos) {
            insertStmt.run(a.id, assetId, a.shape, a.rect.x, a.rect.y, a.rect.w, a.rect.h, a.clauseId, a.scoreWeight, a.description || '');
        }
        updateAssetStmt.run(annos.length > 0 ? 1 : 0, assetId);
    });

    try {
        runTransaction(items);
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 辅助函数：根据比例字典实时计算分值
const calculateItemWeight = (item, riskDict) => {
    const lValue = riskDict.find(d => d.id === item.likelihood_level)?.level_value || 1;
    const cValue = riskDict.find(d => d.id === item.consequence_level)?.level_value || 1;
    return lValue * cValue;
};

// 6. 获取法规字典 (重构: 从三张新表联查聚合为原有嵌套树结构)
app.get('/api/knowledge', async (req, res) => {
    try {
        const db = getDB();

        // 分别查出三张表的数据
        const scenes = db.prepare('SELECT * FROM knowledge_scenes ORDER BY sort_order ASC, id ASC').all();
        const categories = db.prepare('SELECT * FROM knowledge_categories ORDER BY sort_order ASC, id ASC').all();
        const items = db.prepare('SELECT * FROM knowledge_items ORDER BY sort_order ASC, id ASC').all();

        // 获取风险字典用于实时计算权重
        const riskDict = db.prepare('SELECT * FROM risk_dictionary').all();

        // 重新聚合成原来的 tree 结构以保持前端兼容
        const knowledgeTree = scenes.map(s => {
            const sceneCats = categories.filter(c => c.scene_id === s.id);
            return {
                id: s.id, // 新增，便于前端映射
                scene: s.name,
                types: sceneCats.map(c => {
                    const catItems = items.filter(i => i.category_id === c.id);
                    return {
                        id: c.id,
                        typeName: c.name,
                        items: catItems.map(i => ({
                            id: i.id,
                            desc: i.title,
                            clause: i.content,
                            weight: calculateItemWeight(i, riskDict),
                            likelihood_level: i.likelihood_level,
                            consequence_level: i.consequence_level,
                            standard_code: i.standard_code,
                            tags: JSON.parse(i.tags || '[]')
                        }))
                    };
                })
            };
        });

        res.json({ knowledgeTree });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// 知识库管理模块专用 CRUD 接口 (Sprint 16 & 17)
// ==========================================

// --- Risk Dictionary 风险字典 (Sprint 17) ---
app.get('/api/admin/risk/dict', (req, res) => {
    try {
        const rows = getDB().prepare('SELECT * FROM risk_dictionary ORDER BY type ASC, level_value ASC').all();
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/risk/dict/:id', (req, res) => {
    try {
        const { level_name, level_value } = req.body;
        getDB().prepare('UPDATE risk_dictionary SET level_name = ?, level_value = ? WHERE id = ?')
            .run(level_name, level_value, req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Scenes 场景 ---
app.get('/api/admin/knowledge/scenes', (req, res) => {
    try {
        const rows = getDB().prepare('SELECT * FROM knowledge_scenes ORDER BY sort_order ASC').all();
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/knowledge/scenes', (req, res) => {
    try {
        const db = getDB();
        const { name, description } = req.body;
        const id = `sc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const count = db.prepare('SELECT count(*) as c FROM knowledge_scenes').get().c;
        db.prepare('INSERT INTO knowledge_scenes (id, name, description, sort_order) VALUES (?, ?, ?, ?)')
            .run(id, name, description || '', count);
        res.json({ id, name, description, sort_order: count });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/knowledge/scenes/:id', (req, res) => {
    try {
        const { name, description } = req.body;
        getDB().prepare('UPDATE knowledge_scenes SET name = ?, description = ? WHERE id = ?')
            .run(name, description || '', req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/knowledge/scenes/:id', (req, res) => {
    try {
        getDB().prepare('DELETE FROM knowledge_scenes WHERE id = ?').run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Categories 大类 ---
app.get('/api/admin/knowledge/categories', (req, res) => {
    try {
        const { scene_id } = req.query;
        let query = 'SELECT * FROM knowledge_categories ORDER BY sort_order ASC';
        let params = [];
        if (scene_id) {
            query = 'SELECT * FROM knowledge_categories WHERE scene_id = ? ORDER BY sort_order ASC';
            params.push(scene_id);
        }
        res.json(getDB().prepare(query).all(...params));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/knowledge/categories', (req, res) => {
    try {
        const db = getDB();
        const { scene_id, name } = req.body;
        const id = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const count = db.prepare('SELECT count(*) as c FROM knowledge_categories WHERE scene_id = ?').get(scene_id).c;
        db.prepare('INSERT INTO knowledge_categories (id, scene_id, name, sort_order) VALUES (?, ?, ?, ?)')
            .run(id, scene_id, name, count);
        res.json({ id, scene_id, name, sort_order: count });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/knowledge/categories/:id', (req, res) => {
    try {
        const { name } = req.body;
        getDB().prepare('UPDATE knowledge_categories SET name = ? WHERE id = ?').run(name, req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/knowledge/categories/:id', (req, res) => {
    try {
        getDB().prepare('DELETE FROM knowledge_categories WHERE id = ?').run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Items 细则 ---
app.get('/api/admin/knowledge/items', (req, res) => {
    try {
        const { category_id } = req.query;
        let query = 'SELECT * FROM knowledge_items ORDER BY sort_order ASC';
        let params = [];
        if (category_id) {
            query = 'SELECT * FROM knowledge_items WHERE category_id = ? ORDER BY sort_order ASC';
            params.push(category_id);
        }
        const rows = getDB().prepare(query).all(...params);
        const riskDict = getDB().prepare('SELECT * FROM risk_dictionary').all();
        res.json(rows.map(r => ({
            ...r,
            tags: JSON.parse(r.tags || '[]'),
            score_weight: calculateItemWeight(r, riskDict) // 实时覆盖
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/knowledge/items', (req, res) => {
    try {
        const db = getDB();
        const { category_id, title, content, score_weight, likelihood_level, consequence_level, standard_code, tags } = req.body;
        const id = `itm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const count = db.prepare('SELECT count(*) as c FROM knowledge_items WHERE category_id = ?').get(category_id).c;
        db.prepare('INSERT INTO knowledge_items (id, category_id, title, content, score_weight, likelihood_level, consequence_level, standard_code, tags, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(id, category_id, title, content || '', score_weight || 10, likelihood_level || null, consequence_level || null, standard_code || '', JSON.stringify(tags || []), count);
        res.json({ id, category_id, title, score_weight });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/knowledge/items/:id', (req, res) => {
    try {
        const { title, content, score_weight, likelihood_level, consequence_level, standard_code, tags } = req.body;
        getDB().prepare('UPDATE knowledge_items SET title = ?, content = ?, score_weight = ?, likelihood_level = ?, consequence_level = ?, standard_code = ?, tags = ? WHERE id = ?')
            .run(title, content || '', score_weight || 10, likelihood_level || null, consequence_level || null, standard_code || '', JSON.stringify(tags || []), req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/knowledge/items/:id', (req, res) => {
    try {
        getDB().prepare('DELETE FROM knowledge_items WHERE id = ?').run(req.params.id);
        res.json({ status: 'success' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


// 7. 保存用户成绩
app.post('/api/session/record', async (req, res) => {
    try {
        const db = getDB();
        const { examId, userName, score, completedAt } = req.body;
        db.prepare('INSERT INTO records (exam_id, user_name, score, completed_at) VALUES (?, ?, ?, ?)')
            .run(examId, userName, score, completedAt || Date.now());
        res.json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. 组卷保存/发布
app.post('/api/exams/publish', async (req, res) => {
    const db = getDB();
    const { examName, description, slides, status, total_score, scoring_rule } = req.body;
    const examId = examName;
    const finalStatus = status || 'published';

    const insertExam = db.prepare('INSERT OR REPLACE INTO exams (id, exam_name, description, status, settings, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    const deleteItems = db.prepare('DELETE FROM exam_items WHERE exam_id = ?');
    const insertItem = db.prepare('INSERT INTO exam_items (exam_id, asset_id, order_index) VALUES (?, ?, ?)');

    const settings = JSON.stringify({
        totalScore: total_score || 100,
        scoringRule: scoring_rule || 'weighted'
    });

    const tx = db.transaction((data) => {
        insertExam.run(examId, data.examName, data.description || '', finalStatus, settings, Date.now());
        deleteItems.run(examId);
        if (data.slides) {
            data.slides.forEach((assetId, idx) => {
                insertItem.run(examId, assetId, idx);
            });
        }
    });

    try {
        tx({ examName, description, slides });
        const actionText = finalStatus === 'published' ? '发布' : '保存';
        res.json({ status: "success", message: `试卷【${examName}】${actionText}成功！` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. 拉取最新考卷
app.get('/api/exams/latest', async (req, res) => {
    try {
        const db = getDB();
        const exam = db.prepare('SELECT * FROM exams ORDER BY created_at DESC LIMIT 1').get();
        if (!exam) return res.status(404).json({ error: "No exams found" });

        const items = db.prepare('SELECT asset_id FROM exam_items WHERE exam_id = ? ORDER BY order_index ASC').all(exam.id);

        res.json({
            examName: exam.exam_name,
            description: exam.description,
            slides: items.map(i => i.asset_id)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9.1 拉取所有考卷列表
app.get('/api/exams', async (req, res) => {
    try {
        const db = getDB();
        const exams = db.prepare('SELECT * FROM exams ORDER BY created_at DESC').all();

        const data = exams.map(e => {
            const items = db.prepare('SELECT asset_id FROM exam_items WHERE exam_id = ? ORDER BY order_index ASC').all(e.id);
            return {
                name: e.id,
                examName: e.exam_name,
                description: e.description,
                status: e.status || 'published', // 考虑到老数据可能是 active 等
                slides: items.map(i => i.asset_id),
                mtime: e.created_at
            };
        });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9.2 删除试卷
app.delete('/api/exams/:id', async (req, res) => {
    try {
        const db = getDB();
        db.prepare('DELETE FROM exams WHERE id = ?').run(req.params.id);
        res.json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9.3 切换考卷发布状态
app.put('/api/exams/:id/status', async (req, res) => {
    try {
        const db = getDB();
        const { status } = req.body;
        db.prepare('UPDATE exams SET status = ? WHERE id = ?').run(status, req.params.id);
        res.json({ status: "success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. 龙虎榜数据
app.get('/api/session/records/latest', async (req, res) => {
    try {
        const db = getDB();
        const examId = req.query.examId;
        let query = 'SELECT * FROM records';
        let params = [];

        if (examId) {
            query += ' WHERE exam_id = ?';
            params.push(examId);
        }
        query += ' ORDER BY score DESC, completed_at DESC LIMIT 20';

        const records = db.prepare(query).all(...params);
        res.json(records.map(r => ({
            userName: r.user_name,
            examId: r.exam_id,
            score: r.score,
            completedAt: r.completed_at
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 11. 数据库巡检：查询任意表内容
app.get('/api/admin/db/query/:table', async (req, res) => {
    try {
        const db = getDB();
        const table = req.params.table;
        const validTables = [
            'assets', 'annotations', 'exams', 'exam_items', 'records',
            'knowledge_scenes', 'knowledge_categories', 'knowledge_items',
            'risk_dictionary', '_legacy_knowledge'
        ];
        if (!validTables.includes(table)) {
            return res.status(400).json({ error: "Invalid table name" });
        }
        const rows = db.prepare(`SELECT * FROM ${table} LIMIT 100`).all();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 12. 数据清理：强力移除存量 JSON Sidecar 文件
app.post('/api/admin/cleanup', async (req, res) => {
    try {
        const targets = [DIR_META, DIR_EXAMS, DIR_RECORDS];
        let deletedCount = 0;
        for (const dir of targets) {
            if (fsSync.existsSync(dir)) {
                const files = await fs.readdir(dir);
                for (const f of files) {
                    if (f.endsWith('.json')) {
                        await fs.unlink(path.join(dir, f));
                        deletedCount++;
                    }
                }
            }
        }
        res.json({ status: "success", message: `清理完成，共移除 ${deletedCount} 个无效 JSON 文件。` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3000;
const fsSync = require('fs'); // 补充同步引用用于检查逻辑
app.listen(PORT, async () => {
    await initDB();
    console.log(`[SafeEYE-SQL] 后端服务已启动，端口 ${PORT}`);
});
