const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const port = 3000;

// SQLiteデータベースの初期化
const db = new Database('votes.db');

// テーブルがない場合は作成する
db.prepare(`
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    option_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

app.use(express.json());

// 静的ファイルの配信 (index.html)
app.use(express.static(__dirname));

// 投票の登録
app.post('/vote', (req, res) => {
    const { option } = req.body;
    
    if (!option) {
        return res.status(400).json({ error: 'Option is required' });
    }

    try {
        const stmt = db.prepare('INSERT INTO votes (option_name) VALUES (?)');
        stmt.run(option);
        res.json({ message: 'Vote recorded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to record vote' });
    }
});

// 集計結果の取得
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
        res.status(500).json({ error: 'Failed to fetch votes' });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
