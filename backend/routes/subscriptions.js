const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const litService = require('../utils/literature');

router.use(authMiddleware);

// ====== 订阅管理 ======

router.get('/', (req, res) => {
  const subs = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC').all(req.userId);
  res.json({ subscriptions: subs });
});

router.post('/', (req, res) => {
  const uid = req.userId;
  const { topic, frequency, jcr_filter } = req.body || {};
  if (!topic || !['daily', 'weekly', 'biweekly'].includes(frequency)) {
    return res.status(400).json({ error: '请填写订阅主题并选择推送频率' });
  }
  const info = db.prepare(
    'INSERT INTO subscriptions (user_id, topic, frequency, jcr_filter) VALUES (?, ?, ?, ?)'
  ).run(uid, topic, frequency, jcr_filter || 'all');
  res.json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const uid = req.userId;
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').get(id, uid);
  if (!row) return res.status(404).json({ error: '订阅不存在' });

  const { topic, frequency, jcr_filter, is_active } = req.body || {};
  const updates = [];
  const params = [];
  if (topic !== undefined) { updates.push('topic = ?'); params.push(topic); }
  if (frequency) { updates.push('frequency = ?'); params.push(frequency); }
  if (jcr_filter !== undefined) { updates.push('jcr_filter = ?'); params.push(jcr_filter); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

  if (updates.length > 0) {
    params.push(id, uid);
    db.prepare(`UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  }
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const uid = req.userId;
  const info = db.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').run(Number(req.params.id), uid);
  res.json({ changes: info.changes });
});

// 手动触发一次推送
router.post('/:id/run', async (req, res) => {
  const uid = req.userId;
  const id = Number(req.params.id);
  const sub = db.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').get(id, uid);
  if (!sub) return res.status(404).json({ error: '订阅不存在' });

  try {
    const result = await litService.searchLiterature(sub.topic, { page: 1, perPage: 10, sort: 'latest' });
    let added = 0;
    for (const item of result.results || []) {
      if (sub.jcr_filter && sub.jcr_filter !== 'all' && item.jcr_quarter && item.jcr_quarter !== sub.jcr_filter) continue;
      const exist = db.prepare('SELECT id FROM subscription_push WHERE subscription_id = ? AND (doi = ? OR title = ?)').get(id, item.doi, item.title);
      if (exist) continue;
      db.prepare(`INSERT INTO subscription_push
        (subscription_id, doi, title, authors, journal, published_date, jcr_quarter, abstract_en, abstract_zh, pdf_url, source_url, is_new)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(id, item.doi, item.title, item.authors, item.journal, item.published_date, item.jcr_quarter, item.abstract_en, item.abstract_zh, item.pdf_url, item.source_url);
      added++;
    }
    db.prepare('UPDATE subscriptions SET last_run = datetime(\'now\') WHERE id = ?').run(id);
    res.json({ added, total: result.total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 推送列表
router.get('/pushes', (req, res) => {
  const uid = req.userId;
  const { subscriptionId } = req.query;
  let rows;
  if (subscriptionId) {
    rows = db.prepare(`
      SELECT sp.*, s.topic AS topic
      FROM subscription_push sp
      JOIN subscriptions s ON sp.subscription_id = s.id
      WHERE s.user_id = ? AND sp.subscription_id = ?
      ORDER BY sp.pushed_at DESC
    `).all(uid, Number(subscriptionId));
  } else {
    rows = db.prepare(`
      SELECT sp.*, s.topic AS topic
      FROM subscription_push sp
      JOIN subscriptions s ON sp.subscription_id = s.id
      WHERE s.user_id = ?
      ORDER BY sp.pushed_at DESC
    `).all(uid);
  }
  res.json({ pushes: rows });
});

// 标记已读
router.post('/pushes/read', (req, res) => {
  const uid = req.userId;
  const { ids, all } = req.body || {};

  if (all) {
    const info = db.prepare(`
      UPDATE subscription_push SET is_read = 1, is_new = 0
      WHERE subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ?)
    `).run(uid);
    return res.json({ changes: info.changes });
  }

  if (Array.isArray(ids) && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const info = db.prepare(`
      UPDATE subscription_push SET is_read = 1, is_new = 0
      WHERE id IN (${placeholders}) AND subscription_id IN (SELECT id FROM subscriptions WHERE user_id = ?)
    `).run(...ids, uid);
    return res.json({ changes: info.changes });
  }

  res.json({ ok: true });
});

module.exports = router;
