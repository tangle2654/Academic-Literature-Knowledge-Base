const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const axios = require('axios');
const cheerio = require('cheerio');

router.use(authMiddleware);

// 列表（支持搜索、分类、标签筛选）
router.get('/', (req, res) => {
  const uid = req.userId;
  const { q, categoryId, tag, page = 1, perPage = 20 } = req.query;

  const conditions = ['user_id = ?'];
  const params = [uid];

  if (q) {
    conditions.push('(title LIKE ? OR note LIKE ? OR url LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (categoryId) {
    conditions.push('category_id = ?');
    params.push(Number(categoryId));
  }
  if (tag) {
    conditions.push('tags LIKE ?');
    params.push(`%"${tag}"%`);
  }

  const where = 'WHERE ' + conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS c FROM wechat_links ${where}`).get(...params).c;
  const offset = (Number(page) - 1) * Number(perPage);
  const rows = db.prepare(
    `SELECT * FROM wechat_links ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, Number(perPage), offset);

  res.json({
    total, page: Number(page), perPage: Number(perPage),
    results: rows.map(r => ({ ...r, tags: parseJson(r.tags) }))
  });
});

// 单条
router.get('/:id', (req, res) => {
  const uid = req.userId;
  const row = db.prepare('SELECT * FROM wechat_links WHERE id = ? AND user_id = ?').get(Number(req.params.id), uid);
  if (!row) return res.status(404).json({ error: '链接不存在' });
  res.json({ ...row, tags: parseJson(row.tags) });
});

// 新增（自动抓取或手动添加）
router.post('/', async (req, res) => {
  const uid = req.userId;
  const { url, note, category_id, tags, title, summary, published_at, fetch = true } = req.body || {};
  if (!url) return res.status(400).json({ error: '请输入链接' });

  const payload = {
    url,
    category_id: category_id || null,
    note: note || '',
    tags: JSON.stringify(Array.isArray(tags) ? tags : [])
  };

  if (fetch) {
    try {
      const meta = await fetchWechatArticle(url);
      payload.title = title || meta.title;
      payload.summary = summary || meta.summary;
      payload.published_at = published_at || meta.published_at;
    } catch (err) {
      payload.title = title || '';
      payload.summary = summary || '';
      payload.published_at = published_at || '';
    }
  } else {
    payload.title = title || '';
    payload.summary = summary || '';
    payload.published_at = published_at || '';
  }

  const info = db.prepare(`INSERT INTO wechat_links
    (user_id, url, title, published_at, summary, note, tags, category_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uid, url, payload.title, payload.published_at, payload.summary, payload.note, payload.tags, payload.category_id);

  res.json({ id: info.lastInsertRowid, ...payload });
});

// 更新
router.put('/:id', (req, res) => {
  const uid = req.userId;
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM wechat_links WHERE id = ? AND user_id = ?').get(id, uid);
  if (!row) return res.status(404).json({ error: '链接不存在' });

  const updates = [];
  const params = [];
  const allowed = ['url', 'title', 'summary', 'note', 'category_id', 'published_at'];
  Object.entries(req.body || {}).forEach(([k, v]) => {
    if (allowed.includes(k)) {
      updates.push(`${k} = ?`);
      params.push(v === undefined ? null : v);
    }
    if (k === 'tags') {
      updates.push('tags = ?');
      params.push(JSON.stringify(Array.isArray(v) ? v : []));
    }
  });

  if (updates.length === 0) return res.json({ ok: true });
  params.push(id, uid);
  db.prepare(`UPDATE wechat_links SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  res.json({ ok: true });
});

// 删除
router.delete('/:id', (req, res) => {
  const uid = req.userId;
  const info = db.prepare('DELETE FROM wechat_links WHERE id = ? AND user_id = ?').run(Number(req.params.id), uid);
  if (info.changes === 0) return res.status(404).json({ error: '不存在或无权操作' });
  res.json({ changes: info.changes });
});

// 批量操作
router.post('/batch', (req, res) => {
  const uid = req.userId;
  const { action, ids, category_id } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择链接' });
  const placeholders = ids.map(() => '?').join(',');

  if (action === 'delete') {const info = db.prepare(`DELETE FROM wechat_links WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, uid);

    if (info.changes === 0) return res.status(404).json({ error: '不存在或无权操作' });

        return res.json({ changes: info.changes });
  }
  if (action === 'move') {
    const info = db.prepare(`UPDATE wechat_links SET category_id = ? WHERE id IN (${placeholders}) AND user_id = ?`).run(category_id || null, ...ids, uid);
    return res.json({ changes: info.changes });
  }
  res.status(400).json({ error: '未知批量操作' });
});

// 抓取微信公众号文章元信息（公开接口，仅在后端执行避免 CORS）
async function fetchWechatArticle(url) {
  const resp = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    },
    maxRedirects: 5
  });
  const $ = cheerio.load(resp.data);
  const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
  const summary = $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') || '';
  const published_at = $('#publish_time').text() || $('meta[property="article:published_time"]').attr('content') || '';
  return {
    title: title.trim(),
    summary: summary.trim(),
    published_at: published_at.trim()
  };
}

function parseJson(s) {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}

module.exports = router;
