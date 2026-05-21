require('dotenv').config();
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Renderの永続化ディスク用パス設定
const IS_RENDER = process.env.RENDER === 'true';
const DATA_DIR = IS_RENDER ? path.join(__dirname, 'data') : __dirname;
const DB_PATH = path.join(DATA_DIR, 'votes.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// アップロードディレクトリの作成
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// SQLiteデータベースの初期化
const db = new Database(DB_PATH);

// テーブルの拡張
db.prepare(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT NOT NULL,
    content TEXT NOT NULL,
    subject_tag TEXT,
    teacher_tag TEXT,
    image_path TEXT,
    likes INTEGER DEFAULT 0,
    parent_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// カラムが足りない場合の追加処理（既存DBへの配慮）
const columns = db.prepare("PRAGMA table_info(posts)").all();
const columnNames = columns.map(c => c.name);
if (!columnNames.includes('subject_tag')) db.prepare("ALTER TABLE posts ADD COLUMN subject_tag TEXT").run();
if (!columnNames.includes('teacher_tag')) db.prepare("ALTER TABLE posts ADD COLUMN teacher_tag TEXT").run();
if (!columnNames.includes('image_path')) db.prepare("ALTER TABLE posts ADD COLUMN image_path TEXT").run();
if (!columnNames.includes('likes')) db.prepare("ALTER TABLE posts ADD COLUMN likes INTEGER DEFAULT 0").run();
if (!columnNames.includes('parent_id')) db.prepare("ALTER TABLE posts ADD COLUMN parent_id INTEGER").run();

// Multerの設定
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR)); // アップロード画像の静的配信

// セッションの設定
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// 認証チェック用ミドルウェア
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// ログインAPI
app.post('/api/login', (req, res) => {
    const { nickname, password } = req.body;
    const departmentPass = process.env.DEPARTMENT_PASS || 'gakuka2026';

    if (nickname && password === departmentPass) {
        req.session.user = { nickname };
        res.json({ message: 'Login successful' });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// ログアウトAPI
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out' });
});

// ステータス確認API
app.get('/api/status', (req, res) => {
    if (req.session.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false });
    }
});

// 投稿の取得 (検索機能付き)
app.get('/api/posts', isAuthenticated, (req, res) => {
    const { search } = req.query;
    try {
        let stmt;
        if (search) {
            stmt = db.prepare(`
                SELECT * FROM posts 
                WHERE content LIKE ? OR subject_tag LIKE ? OR teacher_tag LIKE ? 
                ORDER BY created_at DESC
            `);
            const searchTerm = `%${search}%`;
            res.json(stmt.all(searchTerm, searchTerm, searchTerm));
        } else {
            stmt = db.prepare('SELECT * FROM posts ORDER BY created_at ASC');
            res.json(stmt.all());
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

// 投稿の登録 (画像・返信対応)
app.post('/api/posts', isAuthenticated, upload.single('image'), (req, res) => {
    const { content, subject_tag, teacher_tag, parent_id } = req.body;
    const image_path = req.file ? `/uploads/${req.file.filename}` : null;

    if (!content) return res.status(400).json({ error: 'Content is required' });

    try {
        const stmt = db.prepare('INSERT INTO posts (nickname, content, subject_tag, teacher_tag, image_path, parent_id) VALUES (?, ?, ?, ?, ?, ?)');
        stmt.run(req.session.user.nickname, content, subject_tag, teacher_tag, image_path, parent_id || null);
        res.json({ message: 'Post created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// いいね機能
app.post('/api/posts/:id/like', isAuthenticated, (req, res) => {
    const { id } = req.params;
    try {
        const stmt = db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?');
        stmt.run(id);
        res.json({ message: 'Liked' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to like post' });
    }
});

// 静的ファイルの配信
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
