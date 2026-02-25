const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');

const DB_PATH = path.join(__dirname, '../data/safeeye.db');
const DIR_RAW = path.join(__dirname, '../data/assets/raw');
const DIR_META = path.join(__dirname, '../data/assets/meta');
const DIR_EXAMS = path.join(__dirname, '../data/exams');
const DIR_RECORDS = path.join(__dirname, '../data/sessions/records');
const KNOWLEDGE_PATH = path.join(__dirname, '../data/knowledge/clauses.json');

let db;

async function initDB() {
    console.log("初始化 SQLite 数据库...");

    // 确保数据目录存在
    await fs.mkdir(path.join(__dirname, '../data/assets'), { recursive: true });
    await fs.mkdir(path.join(__dirname, '../data/sessions'), { recursive: true });
    await fs.mkdir(path.join(__dirname, '../data/knowledge'), { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // 1. 创建表结构
    db.exec(`
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            path TEXT NOT NULL,
            is_annotated INTEGER DEFAULT 0,
            upload_time INTEGER,
            metadata TEXT
        );

        CREATE TABLE IF NOT EXISTS annotations (
            id TEXT PRIMARY KEY,
            asset_id TEXT NOT NULL,
            shape TEXT,
            x REAL, y REAL, w REAL, h REAL,
            clause_id TEXT,
            score_weight INTEGER,
            description TEXT,
            extra_configs TEXT,
            FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS exams (
            id TEXT PRIMARY KEY,
            exam_name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'active',
            created_at INTEGER,
            settings TEXT
        );

        CREATE TABLE IF NOT EXISTS exam_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id TEXT NOT NULL,
            asset_id TEXT NOT NULL,
            order_index INTEGER,
            item_meta TEXT,
            FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE,
            FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id TEXT,
            user_name TEXT,
            score INTEGER,
            duration INTEGER,
            completed_at INTEGER,
            session_log TEXT
        );

        CREATE TABLE IF NOT EXISTS knowledge (
            id TEXT PRIMARY KEY,
            scene TEXT,
            category TEXT,
            title TEXT,
            content TEXT,
            score_weight INTEGER DEFAULT 10,
            standard_code TEXT,
            tags TEXT
        );
    `);

    // 检查是否需要迁移（如果 assets 为空则尝试迁移）
    const count = db.prepare('SELECT count(*) as count FROM assets').get().count;
    if (count === 0) {
        console.log("检测到空数据库，开始从存量 JSON 迁移数据...");
        await migrateData();
    }
}

async function migrateData() {
    // 迁移逻辑：读目录，解析 JSON，存入数据库

    // 1. 迁移 Assets & Annotations
    try {
        if (fsSync.existsSync(DIR_RAW)) {
            const files = await fs.readdir(DIR_RAW);
            for (const file of files) {
                if (!/\.(jpe?g|png|webp)$/i.test(file)) continue;

                const stats = await fs.stat(path.join(DIR_RAW, file));
                const assetId = file; // 暂时直接用文件名作为 ID
                const baseName = path.basename(file, path.extname(file));
                const metaPath = path.join(DIR_META, `${baseName}.json`);

                let isAnnotated = 0;
                let annotations = [];

                if (fsSync.existsSync(metaPath)) {
                    try {
                        const content = await fs.readFile(metaPath, 'utf-8');
                        const data = JSON.parse(content);
                        isAnnotated = 1;
                        annotations = data.items || [];
                    } catch (e) { }
                }

                db.prepare('INSERT OR REPLACE INTO assets (id, filename, path, is_annotated, upload_time) VALUES (?, ?, ?, ?, ?)')
                    .run(assetId, file, `/assets/raw/${file}`, isAnnotated, stats.mtimeMs);

                for (const anno of annotations) {
                    db.prepare('INSERT OR REPLACE INTO annotations (id, asset_id, shape, x, y, w, h, clause_id, score_weight, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                        .run(anno.id, assetId, anno.shape, anno.rect.x, anno.rect.y, anno.rect.w, anno.rect.h, anno.clauseId, anno.scoreWeight, anno.description || '');
                }
            }
        }
    } catch (e) { console.error("Assets 迁移失败", e); }

    // 2. 迁移 Knowledge (clauses.json)
    try {
        let tree = [];
        if (fsSync.existsSync(KNOWLEDGE_PATH)) {
            const content = await fs.readFile(KNOWLEDGE_PATH, 'utf-8');
            const data = JSON.parse(content);
            tree = data.knowledgeTree || [];
        } else {
            console.log("未发现知识库 JSON 文件，使用系统预置默认数据...");
            tree = getDefaultKnowledge();
        }

        for (const scItem of tree) {
            for (const typeItem of scItem.types) {
                for (const item of typeItem.items) {
                    db.prepare('INSERT OR REPLACE INTO knowledge (id, scene, category, title, content, score_weight, standard_code) VALUES (?, ?, ?, ?, ?, ?, ?)')
                        .run(item.id, scItem.scene, typeItem.typeName, item.desc, item.clause, item.weight || 10, '');
                }
            }
        }
    } catch (e) { console.error("Knowledge 迁移失败", e); }

    // 3. 迁移 Exams
    try {
        if (fsSync.existsSync(DIR_EXAMS)) {
            const files = await fs.readdir(DIR_EXAMS);
            for (const f of files) {
                if (!f.endsWith('.json')) continue;
                const content = await fs.readFile(path.join(DIR_EXAMS, f), 'utf-8');
                const data = JSON.parse(content);
                const examId = data.examName;

                db.prepare('INSERT OR REPLACE INTO exams (id, exam_name, description, created_at) VALUES (?, ?, ?, ?)')
                    .run(examId, data.examName, data.description || '', data.createdAt || Date.now());

                if (data.slides) {
                    data.slides.forEach((assetId, idx) => {
                        db.prepare('INSERT INTO exam_items (exam_id, asset_id, order_index) VALUES (?, ?, ?)')
                            .run(examId, assetId, idx);
                    });
                }
            }
        }
    } catch (e) { console.error("Exams 迁移失败", e); }

    // 4. 迁移 Records
    try {
        if (fsSync.existsSync(DIR_RECORDS)) {
            const files = await fs.readdir(DIR_RECORDS);
            for (const f of files) {
                if (!f.endsWith('.json')) continue;
                const content = await fs.readFile(path.join(DIR_RECORDS, f), 'utf-8');
                const data = JSON.parse(content);
                db.prepare('INSERT INTO records (exam_id, user_name, score, completed_at) VALUES (?, ?, ?, ?)')
                    .run(data.examId, data.userName, data.score, data.completedAt);
            }
        }
    } catch (e) { console.error("Records 迁移失败", e); }

    console.log("结构化数据迁移完成。");
}

function getDB() {
    return db;
}

function getDefaultKnowledge() {
    return [
        {
            scene: "建设施工现场",
            types: [
                {
                    typeName: "高处坠落隐患",
                    items: [
                        { id: "JB-01", desc: "高空作业人员未正确佩戴安全防护装备（安全带/安全帽）", clause: "《建设工程安全生产管理条例》第三十二条: 施工单位应当向作业人员提供安全防护用具，并书面告知危险...", weight: 15 },
                        { id: "JB-02", desc: "临边外开洞口未设置围挡防护栏或醒目盖板", clause: "《建筑施工高处作业安全技术规范》JGJ80: 坠落高度基准面2m及以上进行临边作业时，必须按规定设置防护设施...", weight: 20 },
                        { id: "JB-03", desc: "脚手架踏板破损、缺失或未满铺", clause: "《建筑施工扣件式钢管脚手架安全技术规范》JGJ130: 作业层脚手板应铺满、铺稳、铺实...", weight: 15 }
                    ]
                },
                {
                    typeName: "触电灾害隐患",
                    items: [
                        { id: "JB-04", desc: "主干配电箱未上锁或无防雨防砸棚盖措施", clause: "《施工现场临时用电安全技术规范》JGJ46-2005: 配电箱、开关箱应装设在干燥、通风及常温场所...", weight: 10 },
                        { id: "JB-05", desc: "多台设备共用一个开关或插座（一闸多机）", clause: "《施工现场临时用电安全技术规范》JGJ46: 每台用电设备必须有各自专用的开关箱，严禁用同一个开关箱直接控制2台及2台以上用电设备（含插座）。", weight: 20 }
                    ]
                }
            ]
        },
        {
            scene: "化工生产车间",
            types: [
                {
                    typeName: "火灾爆炸隐患",
                    items: [
                        { id: "HG-01", desc: "易燃易爆区域内违章动火或吸烟", clause: "《化学品生产单位特殊作业安全规范》GB30871: 动火作业应办理动火安全作业证，并在规定时间地点动火...", weight: 30 },
                        { id: "HG-02", desc: "生产线消防设备器材被长期遮挡或未点检失效", clause: "《中华人民共和国消防法》第二十八条: 任何单位、个人不得损坏、挪用或者擅自拆除、停用消防设施...", weight: 15 }
                    ]
                }
            ]
        }
    ];
}

module.exports = { initDB, getDB };
