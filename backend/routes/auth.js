const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { hashPassword, comparePassword, generateToken, authMiddleware } = require('../utils/auth');

// 注册
router.post('/register', (req, res) => {
  const { email, password, nickname } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '请输入有效的邮箱地址' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: '密码至少6位，建议包含字母和数字' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: '该邮箱已注册，请直接登录' });
  }

  const info = db.prepare(
    'INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)'
  ).run(email, hashPassword(password), nickname || '');

  const token = generateToken(info.lastInsertRowid, email);

  // 创建默认分类
  db.prepare(
    'INSERT INTO categories (user_id, name, type) VALUES (?, ?, ?)'
  ).run(info.lastInsertRowid, '默认文献库', 'literature');

  res.json({
    token,
    user: { id: info.lastInsertRowid, email, nickname: nickname || '', created_at: new Date().toISOString() }
  });
});

// 登录
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: '请输入邮箱和密码' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !comparePassword(password, user.password_hash)) {
    return res.status(401).json({ error: '邮箱或密码错误' });
  }

  const token = generateToken(user.id, user.email);
  res.json({
    token,
    user: { id: user.id, email: user.email, nickname: user.nickname, created_at: user.created_at }
  });
});

// 获取当前用户信息
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, nickname, created_at FROM users WHERE id = ?').get(req.userId);
  res.json({ user });
});

// 更新账号信息
router.put('/me', authMiddleware, (req, res) => {
  const { nickname, oldPassword, newPassword } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);

  if (nickname !== undefined) {
    db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, req.userId);
  }

  if (oldPassword && newPassword) {
    if (!comparePassword(oldPassword, user.password_hash)) {
      return res.status(400).json({ error: '原密码不正确' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少6位' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.userId);
  }

  const updated = db.prepare('SELECT id, email, nickname, created_at FROM users WHERE id = ?').get(req.userId);
  res.json({ user: updated });
});

// 导出全部数据备份
router.get('/export', authMiddleware, (req, res) => {
  const uid = req.userId;

  const data = {
    user: db.prepare('SELECT id, email, nickname, created_at FROM users WHERE id = ?').get(uid),
    categories: db.prepare('SELECT * FROM categories WHERE user_id = ?').all(uid),
    literature: db.prepare('SELECT * FROM literature WHERE user_id = ?').all(uid).map(r => ({ ...r, tags: parseJson(r.tags) })),
    subscriptions: db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(uid),
    push_records: db.prepare('SELECT * FROM subscription_push WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ?)').all(uid),
    wechat_links: db.prepare('SELECT * FROM wechat_links WHERE user_id = ?').all(uid).map(r => ({ ...r, tags: parseJson(r.tags) })),
    tags: db.prepare('SELECT * FROM tags WHERE user_id = ?').all(uid),
    exported_at: new Date().toISOString()
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=knowledge-backup-${uid}-${Date.now()}.json`);
  res.json(data);
});

function parseJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

module.exports = router;
