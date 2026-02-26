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

// 6. 获取法规字典 (从 SQL 表读取)
app.get('/api/knowledge', async (req, res) => {
    try {
        const db = getDB();
        const rows = db.prepare('SELECT * FROM knowledge').all();

        // 重新聚合成原来的 tree 结构以保持前端兼容
        const treeMap = {};
        rows.forEach(r => {
            if (!treeMap[r.scene]) treeMap[r.scene] = { scene: r.scene, types: {} };
            if (!treeMap[r.scene].types[r.category]) {
                treeMap[r.scene].types[r.category] = { typeName: r.category, items: [] };
            }
            treeMap[r.scene].types[r.category].items.push({
                id: r.id,
                desc: r.title,
                clause: r.content,
                weight: r.score_weight || 10
            });
        });

        const knowledgeTree = Object.values(treeMap).map(s => ({
            scene: s.scene,
            types: Object.values(s.types)
        }));

        res.json({ knowledgeTree });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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
    const { examName, description, slides, status } = req.body;
    const examId = examName;
    const finalStatus = status || 'published';

    const insertExam = db.prepare('INSERT OR REPLACE INTO exams (id, exam_name, description, status, created_at) VALUES (?, ?, ?, ?, ?)');
    const deleteItems = db.prepare('DELETE FROM exam_items WHERE exam_id = ?');
    const insertItem = db.prepare('INSERT INTO exam_items (exam_id, asset_id, order_index) VALUES (?, ?, ?)');

    const tx = db.transaction((data) => {
        insertExam.run(examId, data.examName, data.description || '', finalStatus, Date.now());
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
        const validTables = ['assets', 'annotations', 'exams', 'exam_items', 'records', 'knowledge'];
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
