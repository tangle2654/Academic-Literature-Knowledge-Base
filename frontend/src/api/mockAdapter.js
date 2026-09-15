/**
 * Mock API Adapter - 纯前端模式（Netlify / GitHub Pages 静态托管用）
 * 用 localStorage 模拟全部后端能力，让没有后端的 SPA 也能完整运行。
 * CrossRef 检索/翻译直接从浏览器调（公开 API 支持 CORS）。
 */

import { reactive } from '../reactive.js';

const LS_PREFIX = 'akb_';

function ls(key, val) {
  const k = LS_PREFIX + key;
  if (val === undefined) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; }
  }
  localStorage.setItem(k, JSON.stringify(val));
}
function lsDel(key) { localStorage.removeItem(LS_PREFIX + key); }

function nowISO() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

function genId() { return Date.now() + Math.floor(Math.random() * 10000); }

function loadAllUsers() { return ls('users') || []; }
function saveAllUsers(list) { ls('users', list); }

function mkUser(email, passwordHash, nickname) {
  return { id: genId(), email, password_hash: passwordHash, nickname: nickname || '', created_at: nowISO() };
}

// 简单密码哈希（仅前端 Mock 用，不安全但够用）
function mockHash(pwd) {
  let h = 0;
  for (let i = 0; i < pwd.length; i++) h = ((h << 5) - h + pwd.charCodeAt(i)) | 0;
  return 'm_' + Math.abs(h).toString(16);
}

// ============ Auth ============
export const mockAuth = {
  register(email, password, nickname) {
    const users = loadAllUsers();
    if (users.find(u => u.email === email)) {
      throw { status: 409, error: '该邮箱已注册' };
    }
    const u = mkUser(email, mockHash(password), nickname);
    users.push(u);
    saveAllUsers(users);
    ls(`cat_${u.id}`, [{ id: genId(), user_id: u.id, name: '默认文献库', type: 'literature', created_at: nowISO() }]);
    return { token: `mock.${u.id}.${Date.now()}`, user: stripUser(u) };
  },
  login(email, password) {
    const users = loadAllUsers();
    const u = users.find(x => x.email === email && x.password_hash === mockHash(password));
    if (!u) throw { status: 401, error: '邮箱或密码错误' };
    return { token: `mock.${u.id}.${Date.now()}`, user: stripUser(u) };
  },
  me(userId) {
    const u = loadAllUsers().find(x => x.id === userId);
    return { id: u.id, email: u.email, nickname: u.nickname, created_at: u.created_at };
  },
  updateMe(userId, payload) {
    const users = loadAllUsers();
    const u = users.find(x => x.id === userId);
    if (payload.nickname !== undefined) u.nickname = payload.nickname;
    if (payload.oldPassword && payload.newPassword) {
      if (u.password_hash !== mockHash(payload.oldPassword)) {
        throw { status: 400, error: '原密码不正确' };
      }
      u.password_hash = mockHash(payload.newPassword);
    }
    saveAllUsers(users);
    return stripUser(u);
  },
  exportAll(userId) {
    return {
      user: mockAuth.me(userId),
      categories: ls(`cat_${userId}`) || [],
      literature: (ls(`lib_${userId}`) || []),
      subscriptions: (ls(`sub_${userId}`) || []),
      pushes: (ls(`push_${userId}`) || []),
      wechat_links: (ls(`wx_${userId}`) || []),
      tags: (ls(`tags_${userId}`) || []),
      exported_at: new Date().toISOString()
    };
  }
};

function stripUser(u) {
  return { id: u.id, email: u.email, nickname: u.nickname, created_at: u.created_at };
}

// ============ Categories ============
export const mockCategories = {
  list(userId, type) {
    const list = ls(`cat_${userId}`) || [];
    return type ? list.filter(c => c.type === type) : list;
  },
  create(userId, name, type = 'literature') {
    const list = ls(`cat_${userId}`) || [];
    const item = { id: genId(), user_id: userId, name, type, created_at: nowISO() };
    list.push(item); ls(`cat_${userId}`, list);
    return item;
  },
  update(userId, id, name) {
    const list = ls(`cat_${userId}`) || [];
    const i = list.findIndex(c => c.id === id);
    if (i >= 0) { list[i].name = name; ls(`cat_${userId}`, list); }
  },
  delete(userId, id) {
    const list = ls(`cat_${userId}`) || [];
    const i = list.findIndex(c => c.id === id);
    if (i >= 0) list.splice(i, 1);
    ls(`cat_${userId}`, list);
    // 同时清理 literature/wechat 中的 category_id
    for (const key of [`lib_${userId}`, `wx_${userId}`]) {
      const arr = ls(key) || [];
      arr.forEach(x => { if (x.category_id === id) x.category_id = null; });
      ls(key, arr);
    }
  }
};

// ============ Tags ============
export const mockTags = {
  list(userId) { return ls(`tags_${userId}`) || []; },
  save(userId, name) {
    if (!name) return;
    const list = ls(`tags_${userId}`) || [];
    if (!list.find(t => t.name === name)) {
      list.push({ id: genId(), user_id: userId, name, created_at: nowISO() });
      ls(`tags_${userId}`, list);
    }
  },
  delete(userId, id) {
    const list = ls(`tags_${userId}`) || [];
    const i = list.findIndex(t => t.id === id);
    if (i >= 0) list.splice(i, 1);
    ls(`tags_${userId}`, list);
  }
};

// ============ Library ============
export const mockLibrary = {
  list(userId, params = {}) {
    let arr = ls(`lib_${userId}`) || [];
    const { categoryId, q, tag, minRating, sortBy = 'created_at', order = 'desc' } = params;
    if (categoryId) arr = arr.filter(x => x.category_id === Number(categoryId));
    if (tag) arr = arr.filter(x => (x.tags || []).includes(tag));
    if (minRating) arr = arr.filter(x => (x.rating || 0) >= Number(minRating));
    if (q) {
      const ql = q.toLowerCase();
      arr = arr.filter(x =>
        (x.title || '').toLowerCase().includes(ql) ||
        (x.abstract_en || '').toLowerCase().includes(ql) ||
        (x.abstract_zh || '').toLowerCase().includes(ql) ||
        (x.notes || '').toLowerCase().includes(ql)
      );
    }
    // sort
    const sMap = { created_at: 'created_at', published_date: 'published_date', title: 'title', rating: 'rating' };
    const sk = sMap[sortBy] || 'created_at';
    arr.sort((a, b) => {
      const av = a[sk] || ''; const bv = b[sk] || '';
      if (typeof av === 'number' && typeof bv === 'number') return order === 'asc' ? av - bv : bv - av;
      return order === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    const total = arr.length;
    const page = Number(params.page) || 1;
    const perPage = Number(params.perPage) || 20;
    const start = (page - 1) * perPage;
    return { total, page, perPage, results: arr.slice(start, start + perPage) };
  },
  detail(userId, id) {
    const arr = ls(`lib_${userId}`) || [];
    return arr.find(x => x.id === Number(id));
  },
  add(userId, item) {
    const arr = ls(`lib_${userId}`) || [];
    // 判重
    if (item.doi && arr.find(x => x.doi === item.doi)) {
      throw { status: 409, error: '该文献已收藏', existingId: arr.find(x => x.doi === item.doi).id };
    }
    const rec = {
      id: genId(),
      user_id: userId,
      doi: item.doi || null,
      title: item.title,
      authors: item.authors || '',
      journal: item.journal || '',
      published_date: item.published_date || '',
      abstract_en: item.abstract_en || '',
      abstract_zh: item.abstract_zh || '',
      jcr_quarter: item.jcr_quarter || '',
      pdf_url: item.pdf_url || '',
      source_url: item.source_url || '',
      tags: item.tags || [],
      rating: 0,
      notes: '',
      category_id: item.category_id || null,
      is_subscribed: 0,
      created_at: nowISO()
    };
    arr.push(rec);
    ls(`lib_${userId}`, arr);
    (item.tags || []).forEach(t => mockTags.save(userId, t));
    return { id: rec.id };
  },
  update(userId, id, payload) {
    const arr = ls(`lib_${userId}`) || [];
    const rec = arr.find(x => x.id === Number(id));
    if (!rec) return;
    const allowed = ['title', 'authors', 'journal', 'published_date', 'abstract_en', 'abstract_zh', 'pdf_url', 'source_url', 'notes', 'rating', 'category_id', 'jcr_quarter'];
    allowed.forEach(k => { if (payload[k] !== undefined) rec[k] = payload[k]; });
    if (payload.tags) { rec.tags = payload.tags; payload.tags.forEach(t => mockTags.save(userId, t)); }
    ls(`lib_${userId}`, arr);
  },
  delete(userId, id) {
    const arr = ls(`lib_${userId}`) || [];
    const i = arr.findIndex(x => x.id === Number(id));
    if (i >= 0) { arr.splice(i, 1); ls(`lib_${userId}`, arr); }
  },
  batch(userId, action, ids, category_id) {
    const arr = ls(`lib_${userId}`) || [];
    const set = new Set(ids.map(Number));
    if (action === 'delete') {
      const filtered = arr.filter(x => !set.has(x.id));
      ls(`lib_${userId}`, filtered);
      return { changes: arr.length - filtered.length };
    } else if (action === 'move') {
      arr.forEach(x => { if (set.has(x.id)) x.category_id = category_id || null; });
      ls(`lib_${userId}`, arr);
      return { changes: ids.length };
    } else if (action === 'export') {
      return { data: arr.filter(x => set.has(x.id)) };
    }
  }
};

// ============ Subscriptions ============
export const mockSubs = {
  list(userId) { return ls(`sub_${userId}`) || []; },
  create(userId, topic, frequency, jcr_filter = 'all') {
    const arr = ls(`sub_${userId}`) || [];
    const item = { id: genId(), user_id: userId, topic, frequency, jcr_filter, is_active: 1, last_run: null, created_at: nowISO() };
    arr.push(item); ls(`sub_${userId}`, arr);
    return item;
  },
  update(userId, id, patch) {
    const arr = ls(`sub_${userId}`) || [];
    const s = arr.find(x => x.id === Number(id));
    if (!s) return;
    Object.assign(s, patch);
    ls(`sub_${userId}`, arr);
  },
  delete(userId, id) {
    const arr = ls(`sub_${userId}`) || [];
    const filtered = arr.filter(x => x.id !== Number(id));
    ls(`sub_${userId}`, filtered);
    // 删除相关 push
    const pushes = (ls(`push_${userId}`) || []).filter(p => p.subscription_id !== Number(id));
    ls(`push_${userId}`, pushes);
  },
  async run(userId, subId) {
    const subs = ls(`sub_${userId}`) || [];
    const sub = subs.find(s => s.id === Number(subId));
    if (!sub) throw { status: 404, error: '订阅不存在' };
    // 模拟 CrossRef 调用（用同一套工具函数）
    try {
      const res = await searchCrossRef(sub.topic, { page: 1, perPage: 10, sort: 'latest' });
      const pushes = ls(`push_${userId}`) || [];
      let added = 0;
      for (const item of res.results || []) {
        if (sub.jcr_filter && sub.jcr_filter !== 'all' && item.jcr_quarter && item.jcr_quarter !== sub.jcr_filter) continue;
        if (pushes.find(p => p.subscription_id === subId && ((item.doi && p.doi === item.doi) || p.title === item.title))) continue;
        pushes.push({
          id: genId(),
          subscription_id: Number(subId),
          doi: item.doi || null,
          title: item.title,
          authors: item.authors,
          journal: item.journal,
          published_date: item.published_date,
          jcr_quarter: item.jcr_quarter,
          abstract_en: item.abstract_en,
          abstract_zh: item.abstract_zh || '',
          pdf_url: item.pdf_url,
          source_url: item.source_url,
          is_read: 0,
          is_new: 1,
          topic: sub.topic,
          pushed_at: nowISO()
        });
        added++;
      }
      ls(`push_${userId}`, pushes);
      sub.last_run = nowISO();
      ls(`sub_${userId}`, subs);
      return { added, total: res.total };
    } catch (err) {
      // 即使 CrossRef 挂了也更新 last_run
      sub.last_run = nowISO();
      ls(`sub_${userId}`, subs);
      // 给一些模拟结果
      return { added: 0, total: 0 };
    }
  }
};

// ============ Pushes ============
export const mockPushes = {
  list(userId, subscriptionId) {
    const arr = ls(`push_${userId}`) || [];
    if (subscriptionId) return arr.filter(p => p.subscription_id === Number(subscriptionId));
    return arr;
  },
  read(userId, ids, all) {
    const arr = ls(`push_${userId}`) || [];
    if (all) {
      arr.forEach(p => { p.is_read = 1; p.is_new = 0; });
    } else {
      const set = new Set(ids.map(Number));
      arr.forEach(p => { if (set.has(p.id)) { p.is_read = 1; p.is_new = 0; } });
    }
    ls(`push_${userId}`, arr);
  }
};

// ============ Wechat ============
export const mockWechat = {
  list(userId, params = {}) {
    let arr = ls(`wx_${userId}`) || [];
    const { q, categoryId, tag, page = 1, perPage = 20 } = params;
    if (categoryId) arr = arr.filter(x => x.category_id === Number(categoryId));
    if (tag) arr = arr.filter(x => (x.tags || []).includes(tag));
    if (q) {
      const ql = q.toLowerCase();
      arr = arr.filter(x =>
        (x.title || '').toLowerCase().includes(ql) ||
        (x.note || '').toLowerCase().includes(ql) ||
        (x.url || '').toLowerCase().includes(ql)
      );
    }
    const total = arr.length;
    arr.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const start = (page - 1) * perPage;
    return { total, page, perPage, results: arr.slice(start, start + perPage) };
  },
  detail(userId, id) {
    return (ls(`wx_${userId}`) || []).find(x => x.id === Number(id));
  },
  add(userId, payload) {
    const arr = ls(`wx_${userId}`) || [];
    const item = {
      id: genId(),
      user_id: userId,
      url: payload.url,
      title: payload.title || '公众号文章',
      summary: payload.summary || '',
      published_at: payload.published_at || '',
      note: payload.note || '',
      tags: payload.tags || [],
      category_id: payload.category_id || null,
      created_at: nowISO()
    };
    arr.push(item); ls(`wx_${userId}`, arr);
    (payload.tags || []).forEach(t => mockTags.save(userId, t));
    return item;
  },
  update(userId, id, patch) {
    const arr = ls(`wx_${userId}`) || [];
    const rec = arr.find(x => x.id === Number(id));
    if (!rec) return;
    Object.assign(rec, patch);
    if (patch.tags) patch.tags.forEach(t => mockTags.save(userId, t));
    ls(`wx_${userId}`, arr);
  },
  delete(userId, id) {
    const arr = ls(`wx_${userId}`) || [];
    const filtered = arr.filter(x => x.id !== Number(id));
    ls(`wx_${userId}`, filtered);
  },
  batch(userId, action, ids, category_id) {
    const arr = ls(`wx_${userId}`) || [];
    const set = new Set(ids.map(Number));
    if (action === 'delete') {
      const filtered = arr.filter(x => !set.has(x.id));
      ls(`wx_${userId}`, filtered);
    } else if (action === 'move') {
      arr.forEach(x => { if (set.has(x.id)) x.category_id = category_id || null; });
      ls(`wx_${userId}`, arr);
    }
  }
};

// ============ CrossRef + Translate (浏览器直连) ============
async function searchCrossRef(q, opts = {}) {
  const params = new URLSearchParams();
  params.append('query', q);
  params.append('rows', opts.perPage || 20);
  params.append('offset', ((opts.page || 1) - 1) * (opts.perPage || 20));
  if (opts.sort === 'latest') { params.append('sort', 'published'); params.append('order', 'desc'); }
  const resp = await fetch(`https://api.crossref.org/works?${params}`, {
    headers: { 'User-Agent': 'AcademicKB/1.0 (mailto:kb@example.com)' }
  });
  const data = await resp.json();
  const items = data.message.items || [];
  return {
    total: data.message['total-results'] || 0,
    page: opts.page || 1,
    perPage: opts.perPage || 20,
    results: items.map(item => ({
      doi: item.DOI,
      title: (item.title && item.title[0]) || '无标题',
      authors: (item.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', '),
      journal: (item['container-title'] && item['container-title'][0]) || '',
      published_date: item['issued'] && item['issued']['date-parts'] ? item['issued']['date-parts'][0].join('-') : '',
      abstract_en: stripHtml(item.abstract || ''),
      jcr_quarter: '',
      pdf_url: '',
      source_url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : '')
    }))
  };
}

async function stripHtml(s) { return (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }

export async function mockSearchLiterature(params) {
  return searchCrossRef(params.q, {
    page: Number(params.page),
    perPage: Number(params.perPage),
    sort: params.sort
  });
}

export async function mockTranslate(text, source = 'en', target = 'zh') {
  if (!text) return { translated: '' };
  try {
    const resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`);
    const data = await resp.json();
    return { translated: (data.responseData && data.responseData.translatedText) || text };
  } catch {
    return { translated: text };
  }
}

export async function mockDoiLookup(doi) {
  try {
    const resp = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    const data = await resp.json();
    const item = data.message;
    return {
      doi: item.DOI,
      title: (item.title && item.title[0]) || '',
      authors: (item.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', '),
      journal: (item['container-title'] && item['container-title'][0]) || '',
      published_date: item['issued'] && item['issued']['date-parts'] ? item['issued']['date-parts'][0].join('-') : '',
      abstract_en: stripHtml(item.abstract || ''),
      source_url: item.URL || `https://doi.org/${item.DOI}`
    };
  } catch { return null; }
}

// ============ 解析 mock token ============
export function parseMockToken(token) {
  if (!token || !token.startsWith('mock.')) return null;
  const parts = token.split('.');
  return { userId: Number(parts[1]) };
}
