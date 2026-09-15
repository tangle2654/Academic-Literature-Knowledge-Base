const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { authMiddleware } = require('../utils/auth');
const litService = require('../utils/literature');

// 所有子路由鉴权
router.use(authMiddleware);

// 文献检索代理
router.get('/search', async (req, res) => {
  const { q, page = 1, perPage = 20, sort = 'relevance', year, yearFrom, yearTo, author, journal, jcr } = req.query;
  if (!q || q.trim().length === 0) {
    return res.status(400).json({ error: '请输入检索关键词' });
  }
  try {
    const result = await litService.searchLiterature(q.trim(), {
      page: Number(page),
      perPage: Number(perPage),
      sort,
      filters: { year, yearFrom, yearTo, author, journal }
    });
    // JCR 筛选在客户端也可做
    if (jcr && jcr !== 'all' && result.results) {
      result.results = result.results.filter(r => !r.jcr_quarter || r.jcr_quarter === jcr);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 翻译摘要
router.post('/translate', async (req, res) => {
  const { text, source = 'en', target = 'zh' } = req.body || {};
  if (!text) return res.json({ text: '' });
  try {
    const translated = await litService.translateText(text, source, target);
    res.json({ translated, original: text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 通过 DOI 获取文献详情
router.get('/doi/:doi', async (req, res) => {
  try {
    const data = await litService.getLiteratureByDoi(decodeURIComponent(req.params.doi));
    if (!data) return res.status(404).json({ error: '未找到该 DOI 对应文献' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 获取开放获取 PDF
router.get('/pdf/:doi', async (req, res) => {
  try {
    const url = await litService.getOpenAccessPdf(decodeURIComponent(req.params.doi));
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
