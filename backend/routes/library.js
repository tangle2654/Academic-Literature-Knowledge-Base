const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const litService = require('../utils/literature');

router.use(authMiddleware);

// ====== 文献库（收藏）CRUD ======

// 收藏列表（含筛选、分页、搜索）
router.get('/', (req, res) => {
  const uid = req.userId;
  const { page = 1, perPage = 20, categoryId, q, sortBy = 'created_at', order = 'desc', tag, minRating } = req.query;

  const conditions = ['user_id = ?'];
  const params = [uid];

  if (categoryId) {
    conditions.push('category_id = ?');
    params.push(Number(categoryId));
  }
  if (q) {
    conditions.push('(title LIKE ? OR abstract_en LIKE ? OR abstract_zh LIKE ? OR notes LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (tag) {
    conditions.push('tags LIKE ?');
    params.push(`%"${tag}"%`);
  }
  if (minRating) {
    conditions.push('rating >= ?');
    params.push(Number(minRating));
  }

  const where = 'WHERE ' + conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS c FROM literature ${where}`).get(...params).c;

  // 排序字段白名单
  const sortMap = {
    created_at: 'created_at',
    published_date: 'published_date',
    title: 'title',
    rating: 'rating'
  };
  const sCol = sortMap[sortBy] || 'created_at';
  const sDir = order === 'asc' ? 'ASC' : 'DESC';

  const offset = (Number(page) - 1) * Number(perPage);
  const rows = db.prepare(
    `SELECT * FROM literature ${where} ORDER BY ${sCol} ${sDir} LIMIT ? OFFSET ?`
  ).all(...params, Number(perPage), offset);

  const data = rows.map(r => ({ ...r, tags: parseJson(r.tags) }));

  res.json({ total, page: Number(page), perPage: Number(perPage), results: data });
});

// 单条文献详情
router.get('/:id', (req, res) => {
  const uid = req.userId;
  const row = db.prepare('SELECT * FROM literature WHERE id = ? AND user_id = ?').get(Number(req.params.id), uid);
  if (!row) return res.status(404).json({ error: '文献不存在' });
  res.json({ ...row, tags: parseJson(row.tags) });
});

// 收藏文献
router.post('/', (req, res) => {
  const uid = req.userId;
  const { doi, title, authors, journal, published_date, abstract_en, abstract_zh, jcr_quarter, pdf_url, source_url, category_id, tags } = req.body;

  if (!title) return res.status(400).json({ error: '文献标题不能为空' });

  // 避免重复收藏（按 DOI 判重，无 DOI 则按标题+作者）
  if (doi) {
    const exist = db.prepare('SELECT id FROM literature WHERE user_id = ? AND doi = ?').get(uid, doi);
    if (exist) {
      return res.status(409).json({ error: '该文献已收藏', existingId: exist.id });
    }
  } else {
    const exist = db.prepare('SELECT id FROM literature WHERE user_id = ? AND title = ?').get(uid, title);
    if (exist) {
      return res.status(409).json({ error: '该文献已收藏', existingId: exist.id });
    }
  }

  const info = db.prepare(`INSERT INTO literature
    (user_id, doi, title, authors, journal, published_date, abstract_en, abstract_zh, jcr_quarter, pdf_url, source_url, category_id, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uid, doi || null, title, authors || '', journal || '', published_date || '',
    abstract_en || '', abstract_zh || '', jcr_quarter || '', pdf_url || '', source_url || '',
    category_id || null, JSON.stringify(tags || [])
  );

  // 同步保存标签
  if (Array.isArray(tags)) {
    tags.forEach(t => saveTag(uid, t));
  }

  res.json({ id: info.lastInsertRowid });
});

// 更新文献（笔记、标签、评分、分类）
router.put('/:id', (req, res) => {
  const uid = req.userId;
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id FROM literature WHERE id = ? AND user_id = ?').get(id, uid);
  if (!row) return res.status(404).json({ error: '文献不存在' });

  const updates = [];
  const params = [];
  const allowed = ['title', 'authors', 'journal', 'published_date', 'abstract_en', 'abstract_zh', 'pdf_url', 'source_url', 'notes', 'rating', 'category_id', 'jcr_quarter'];

  Object.entries(req.body || {}).forEach(([k, v]) => {
    if (allowed.includes(k)) {
      updates.push(`${k} = ?`);
      params.push(v === undefined ? null : v);
    }
    if (k === 'tags') {
      updates.push('tags = ?');
      params.push(JSON.stringify(Array.isArray(v) ? v : []));
      if (Array.isArray(v)) v.forEach(t => saveTag(uid, t));
    }
  });

  if (updates.length === 0) return res.json({ ok: true });
  params.push(id, uid);
  db.prepare(`UPDATE literature SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);

  res.json({ ok: true });
});

// 删除单条
router.delete('/:id', (req, res) => {
  const uid = req.userId;
  const info = db.prepare('DELETE FROM literature WHERE id = ? AND user_id = ?').run(Number(req.params.id), uid);
  if (info.changes === 0) return res.status(404).json({ error: '不存在或无权操作' });
  res.json({ changes: info.changes });
});

// 批量操作
router.post('/batch', (req, res) => {
  const uid = req.userId;
  const { action, ids, category_id } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择文献' });

  const placeholders = ids.map(() => '?').join(',');
  const base = `FROM literature WHERE id IN (${placeholders}) AND user_id = ?`;

  let changes = 0;
  if (action === 'delete') {
    const info = db.prepare(`DELETE ${base}`).run(...ids, uid);
    changes = info.changes;
  } else if (action === 'move') {
    const info = db.prepare(`UPDATE literature SET category_id = ? WHERE id IN (${placeholders}) AND user_id = ?`).run(category_id || null, ...ids, uid);
    changes = info.changes;
  } else if (action === 'export') {
    // 返回文献列表用于生成引用
    const rows = db.prepare(`SELECT * ${base}`).all(...ids, uid);
    return res.json({ data: rows.map(r => ({ ...r, tags: parseJson(r.tags) })) });
  }

  res.json({ changes });
});

// DOI 批量导入
router.post('/import-doi', async (req, res) => {
  const uid = req.userId;
  const { dois, category_id } = req.body || {};
  if (!Array.isArray(dois) || dois.length === 0) return res.status(400).json({ error: '请输入 DOI 列表' });

  const results = [];
  for (const raw of dois) {
    const doi = String(raw).trim();
    if (!doi) continue;
    try {
      const detail = await litService.getLiteratureByDoi(doi);
      if (!detail) {
        results.push({ doi, success: false, reason: '未找到' });
        continue;
      }

      const exist = db.prepare('SELECT id FROM literature WHERE user_id = ? AND doi = ?').get(uid, doi);
      if (exist) {
        results.push({ doi, success: false, reason: '已收藏', id: exist.id });
        continue;
      }

      const translated = await litService.translateText(detail.abstract_en || '');

      const info = db.prepare(`INSERT INTO literature
        (user_id, doi, title, authors, journal, published_date, abstract_en, abstract_zh, source_url, category_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uid, detail.doi, detail.title, detail.authors, detail.journal, detail.published_date,
        detail.abstract_en, translated, detail.source_url, category_id || null);

      results.push({ doi, success: true, id: info.lastInsertRowid });
    } catch (err) {
      results.push({ doi, success: false, reason: err.message });
    }
    // 礼貌间隔
    await new Promise(r => setTimeout(r, 300));
  }

  res.json({ count: results.length, results });
});

// 工具
function parseJson(s) {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}
function saveTag(uid, name) {
  if (!name) return;
  const exist = db.prepare('SELECT id FROM tags WHERE user_id = ? AND name = ?').get(uid, name);
  if (!exist) {
    db.prepare('INSERT INTO tags (user_id, name) VALUES (?, ?)').run(uid, name);
  }
}

module.exports = router;
