const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '../../data/app.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 创建所有表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'literature', -- literature | wechat | shared
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS literature (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    doi TEXT,
    title TEXT NOT NULL,
    authors TEXT,
    journal TEXT,
    published_date TEXT,
    abstract_en TEXT,
    abstract_zh TEXT,
    jcr_quarter TEXT,
    pdf_url TEXT,
    source_url TEXT,
    tags TEXT, -- JSON array
    rating INTEGER DEFAULT 0, -- 1-5
    notes TEXT,
    category_id INTEGER,
    is_subscribed INTEGER DEFAULT 0, -- 来自订阅推送
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    topic TEXT NOT NULL,
    frequency TEXT NOT NULL, -- daily | weekly | biweekly
    jcr_filter TEXT DEFAULT 'all', -- all | Q1 | Q2 | Q3 | Q4
    is_active INTEGER DEFAULT 1,
    last_run TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS subscription_push (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL,
    literature_id INTEGER,
    doi TEXT,
    title TEXT,
    authors TEXT,
    journal TEXT,
    published_date TEXT,
    jcr_quarter TEXT,
    abstract_en TEXT,
    abstract_zh TEXT,
    pdf_url TEXT,
    source_url TEXT,
    is_read INTEGER DEFAULT 0,
    is_new INTEGER DEFAULT 1,
    pushed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS wechat_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    published_at TEXT,
    summary TEXT,
    note TEXT,
    tags TEXT,
    category_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_literature_user ON literature(user_id);
  CREATE INDEX IF NOT EXISTS idx_literature_category ON literature(category_id);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_push_sub ON subscription_push(subscription_id);
  CREATE INDEX IF NOT EXISTS idx_wechat_user ON wechat_links(user_id);
  CREATE INDEX IF NOT EXISTS idx_wechat_category ON wechat_links(category_id);
  CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
`);

// 自动迁移：subscription_push 表增加 doi 列（兼容早期数据库）
try {
  const cols = db.prepare("PRAGMA table_info(subscription_push)").all().map(c => c.name);
  if (!cols.includes('doi')) {
    db.exec('ALTER TABLE subscription_push ADD COLUMN doi TEXT');
    console.log('[migrate] subscription_push: added doi column');
  }
} catch (e) {
  console.warn('[migrate] subscription_push doi column check skipped:', e.message);
}

module.exports = db;
