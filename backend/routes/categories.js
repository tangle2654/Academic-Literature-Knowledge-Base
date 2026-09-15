const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const axios = require('axios');
const cheerio = require('cheerio');

router.use(authMiddleware);

// ====== 分类 ======

router.get('/', (req, res) => {
  const { type } = req.query;
  let rows;
  if (type) {
    rows = db.prepare('SELECT * FROM categories WHERE user_id = ? AND type = ? ORDER BY created_at DESC').all(req.userId, type);
  } else {
    rows = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  }
  res.json({ categories: rows });
});

router.post('/', (req, res) => {
  const { name, type = 'literature' } = req.body || {};
  if (!name) return res.status(400).json({ error: '分类名称不能为空' });
  const info = db.prepare('INSERT INTO categories (user_id, name, type) VALUES (?, ?, ?)').run(req.userId, name, type);
  res.json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const uid = req.userId;
  const { name } = req.body || {};
  db.prepare('UPDATE categories SET name = ? WHERE id = ? AND user_id = ?').run(name, Number(req.params.id), uid);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const uid = req.userId;
  const info = db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(Number(req.params.id), uid);
  if (info.changes === 0) return res.status(404).json({ error: '不存在或无权操作' });
  res.json({ changes: info.changes });
});

// ====== 标签 ======

router.get('/tags/list', (req, res) => {
  const rows = db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC').all(req.userId);
  res.json({ tags: rows });
});

router.delete('/tags/:id', (req, res) => {
  const uid = req.userId;
  const info = db.prepare('DELETE FROM tags WHERE id = ? AND user_id = ?').run(Number(req.params.id), uid);
  if (info.changes === 0) return res.status(404).json({ error: '不存在或无权操作' });
  res.json({ changes: info.changes });
});

module.exports = router;
