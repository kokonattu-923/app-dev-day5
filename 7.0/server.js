const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Renderなどの環境を考慮したパス設定
const IS_RENDER = process.env.RENDER === 'true';
const DATA_DIR = IS_RENDER ? '/data' : __dirname;
const DB_PATH = path.join(DATA_DIR, 'votes.db');

// データディレクトリの作成（Render用）
if (IS_RENDER && !fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// データベースの初期化
const db = new Database(DB_PATH);

// テーブルの自動作成
db.prepare(`
    CREATE TABLE IF NOT EXISTS votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        option_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();

// ミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// 投票の登録
app.post('/vote', (req, res) => {
    const { option } = req.body;
    if (!option) {
        return res.status(400).json({ error: 'Option name is required' });
    }

    try {
        const stmt = db.prepare('INSERT INTO votes (option_name) VALUES (?)');
        stmt.run(option);
        res.json({ message: 'Vote recorded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 投票結果の集計
app.get('/votes', (req, res) => {
    try {
        const stmt = db.prepare(`
            SELECT option_name AS option, COUNT(*) AS count 
            FROM votes 
            GROUP BY option_name
        `);
        const results = stmt.all();
        res.json(results);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

// 静的ファイルの配信
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// サーバー起動
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
