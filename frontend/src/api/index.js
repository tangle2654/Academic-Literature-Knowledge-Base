import { state, logout } from '../store/index.js';
import {
  mockAuth, mockCategories, mockTags, mockLibrary,
  mockSubs, mockPushes, mockWechat,
  mockSearchLiterature, mockTranslate, mockDoiLookup,
  parseMockToken
} from './mockAdapter.js';

// ========= 模式检测 =========
// VITE_API_BASE 可由环境变量覆盖（Netlify: VITE_API_BASE=https://your-backend.example.com/api）
// 当 BASE 指向的后端不可用时，自动降级到 Mock 模式
const BASE = import.meta.env.VITE_API_BASE || '/api';
let _backendOnline = null; // null=未检测  true=在线  false=离线

async function probeBackend() {
  if (_backendOnline !== null) return _backendOnline;
  try {
    const resp = await fetch(BASE + '/health', { method: 'GET' });
    if (resp.ok) { _backendOnline = true; return true; }
  } catch {}
  _backendOnline = false;
  return false;
}

export async function ensureBackendReady() {
  return probeBackend();
}

function getUserId() {
  if (!state.token) return null;
  // 真实 JWT：直接从 store 读取（注册/登录时已经把 userId 放进 state.user.id 了）
  if (state.user && state.user.id) return state.user.id;
  // mock token
  const m = parseMockToken(state.token);
  return m ? m.userId : null;
}

// ========= 真实请求 =========
async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  let resp;
  try {
    resp = await fetch(BASE + path, opts);
  } catch (err) {
    // 如果第一次请求就失败，说明后端离线，后续请求走 mock
    _backendOnline = false;
    throw { __mock_fallback__: true };
  }

  if (resp.status === 401) {
    logout();
    window.location.hash = '#/login';
    throw new Error('登录已过期，请重新登录');
  }

  let data;
  try { data = await resp.json(); } catch { data = {}; }

  if (!resp.ok) {
    throw new Error(data.error || `请求失败 (${resp.status})`);
  }
  return data;
}

// ========= Mock 版请求（返回值必须与真实 API 同结构） =========
function mAuth() {
  return {
    register: async (email, password, nickname) => mockAuth.register(email, password, nickname),
    login: async (email, password) => mockAuth.login(email, password),
    me: async () => ({ user: mockAuth.me(getUserId()) }),
    updateMe: async (payload) => ({ user: mockAuth.updateMe(getUserId(), payload) }),
    exportData: async () => mockAuth.exportAll(getUserId())
  };
}

function mLit() {
  return {
    searchLiterature: (params) => mockSearchLiterature(params),
    translate: (text, source, target) => mockTranslate(text, source, target),
    doi: (doi) => mockDoiLookup(doi),
    pdf: async () => ({ url: null })
  };
}

function mLib() {
  const u = getUserId();
  return {
    libraryList: (params) => mockLibrary.list(u, params),
    libraryDetail: (id) => mockLibrary.detail(u, id),
    libraryAdd: (payload) => mockLibrary.add(u, payload),
    libraryUpdate: (id, payload) => mockLibrary.update(u, id, payload),
    libraryDelete: (id) => mockLibrary.delete(u, id),
    libraryBatch: (action, ids, category_id) => mockLibrary.batch(u, action, ids, category_id),
    libraryImportDoi: async (dois, category_id) => {
      const results = [];
      for (const d of dois) {
        try {
          const info = await mockDoiLookup(d.trim());
          if (!info) { results.push({ doi: d, success: false, reason: '未找到' }); continue; }
          const r = mockLibrary.add(u, { doi: info.doi, title: info.title, authors: info.authors, journal: info.journal, published_date: info.published_date, abstract_en: info.abstract_en, source_url: info.source_url, category_id });
          results.push({ doi: d, success: true, id: r.id });
        } catch (err) { results.push({ doi: d, success: false, reason: err.message }); }
      }
      return { count: results.length, results };
    }
  };
}

function mSubs() {
  const u = getUserId();
  return {
    subscriptionsList: () => mockSubs.list(u),
    subscriptionCreate: (payload) => mockSubs.create(u, payload.topic, payload.frequency, payload.jcr_filter || 'all'),
    subscriptionUpdate: (id, payload) => mockSubs.update(u, id, payload),
    subscriptionDelete: (id) => mockSubs.delete(u, id),
    subscriptionRun: (id) => mockSubs.run(u, id),
    pushesList: (sid) => mockPushes.list(u, sid),
    pushesRead: (ids, all) => mockPushes.read(u, ids, all)
  };
}

function mCat() {
  const u = getUserId();
  return {
    categoriesList: (type) => mockCategories.list(u, type),
    categoryCreate: (name, type) => mockCategories.create(u, name, type),
    categoryUpdate: (id, name) => mockCategories.update(u, id, name),
    categoryDelete: (id) => mockCategories.delete(u, id),
    tagsList: () => mockTags.list(u),
    tagDelete: (id) => mockTags.delete(u, id)
  };
}

function mWx() {
  const u = getUserId();
  return {
    wechatList: (params) => mockWechat.list(u, params),
    wechatDetail: (id) => mockWechat.detail(u, id),
    wechatAdd: (payload) => mockWechat.add(u, payload),
    wechatUpdate: (id, payload) => mockWechat.update(u, id, payload),
    wechatDelete: (id) => mockWechat.delete(u, id),
    wechatBatch: (action, ids, category_id) => mockWechat.batch(u, action, ids, category_id)
  };
}

// ========= API 导出（自动路由到真实后端或 Mock） =========
export const api = new Proxy({}, {
  get(_, method) {
    return async function(...args) {
      // Auth 注册/登录之前没有 token，直接走真实 API 再 fallback
      const noAuthNeeded = ['register', 'login', 'exportData']; // exportData 虽然要 token 但也可以 mock
      const needsProbe = _backendOnline === null && !['register', 'login'].includes(method);

      if (needsProbe) {
        await probeBackend();
      }

      const useMock = _backendOnline === false;

      if (useMock) {
        return dispatchMock(method, args);
      }

      // 真实调用
      try {
        return dispatchReal(method, args);
      } catch (err) {
        // 注册/登录失败不降级（Mock 也能处理）
        if (err && err.__mock_fallback__) {
          _backendOnline = false;
          return dispatchMock(method, args);
        }
        // 业务错误（如 409 dup email）向上抛
        if (err instanceof Error) throw err;
        if (err && err.error) throw new Error(err.error);
        throw err;
      }
    };
  }
});

function dispatchReal(method, args) {
  switch (method) {
    case 'register': return request('POST', '/auth/register', { email: args[0], password: args[1], nickname: args[2] });
    case 'login': return request('POST', '/auth/login', { email: args[0], password: args[1] });
    case 'me': return request('GET', '/auth/me');
    case 'updateMe': return request('PUT', '/auth/me', args[0]);
    case 'exportData': return fetch(BASE + '/auth/export', { headers: tokenHeaders() }).then(r => r.json());
    case 'searchLiterature': return request('GET', '/literature/search?' + new URLSearchParams(args[0]));
    case 'translate': return request('POST', '/literature/translate', { text: args[0], source: args[1] || 'en', target: args[2] || 'zh' });
    case 'doi': return request('GET', `/literature/doi/${encodeURIComponent(args[0])}`);
    case 'pdf': return request('GET', `/literature/pdf/${encodeURIComponent(args[0])}`);
    case 'libraryList': return request('GET', '/library?' + new URLSearchParams(args[0]));
    case 'libraryDetail': return request('GET', `/library/${args[0]}`);
    case 'libraryAdd': return request('POST', '/library', args[0]);
    case 'libraryUpdate': return request('PUT', `/library/${args[0]}`, args[1]);
    case 'libraryDelete': return request('DELETE', `/library/${args[0]}`);
    case 'libraryBatch': return request('POST', '/library/batch', { action: args[0], ids: args[1], category_id: args[2] });
    case 'libraryImportDoi': return request('POST', '/library/import-doi', { dois: args[0], category_id: args[1] });
    case 'subscriptionsList': return request('GET', '/subscriptions').then(r => r.subscriptions);
    case 'subscriptionCreate': return request('POST', '/subscriptions', args[0]);
    case 'subscriptionUpdate': return request('PUT', `/subscriptions/${args[0]}`, args[1]);
    case 'subscriptionDelete': return request('DELETE', `/subscriptions/${args[0]}`);
    case 'subscriptionRun': return request('POST', `/subscriptions/${args[0]}/run`);
    case 'pushesList': { const p = args[0] ? '?subscriptionId=' + args[0] : ''; return request('GET', `/subscriptions/pushes${p}`).then(r => r.pushes); }
    case 'pushesRead': return request('POST', '/subscriptions/pushes/read', args[1] ? { all: true } : { ids: args[0] });
    case 'categoriesList': return request('GET', '/categories' + (args[0] ? '?type=' + args[0] : '')).then(r => r.categories);
    case 'categoryCreate': return request('POST', '/categories', { name: args[0], type: args[1] || 'literature' });
    case 'categoryUpdate': return request('PUT', `/categories/${args[0]}`, { name: args[1] });
    case 'categoryDelete': return request('DELETE', `/categories/${args[0]}`);
    case 'tagsList': return request('GET', '/categories/tags/list').then(r => r.tags);
    case 'tagDelete': return request('DELETE', `/categories/tags/${args[0]}`);
    case 'wechatList': return request('GET', '/wechat?' + new URLSearchParams(args[0]));
    case 'wechatDetail': return request('GET', `/wechat/${args[0]}`);
    case 'wechatAdd': return request('POST', '/wechat', args[0]);
    case 'wechatUpdate': return request('PUT', `/wechat/${args[0]}`, args[1]);
    case 'wechatDelete': return request('DELETE', `/wechat/${args[0]}`);
    case 'wechatBatch': return request('POST', '/wechat/batch', { action: args[0], ids: args[1], category_id: args[2] });
  }
}

function dispatchMock(method, args) {
  const a = mAuth(), l = mLit(), lb = mLib(), s = mSubs(), c = mCat(), w = mWx();
  switch (method) {
    case 'register': return a.register(args[0], args[1], args[2]);
    case 'login': return a.login(args[0], args[1]);
    case 'me': return a.me();
    case 'updateMe': return a.updateMe(args[0]);
    case 'exportData': return a.exportData();
    case 'searchLiterature': return l.searchLiterature(args[0]);
    case 'translate': return l.translate(args[0], args[1], args[2]);
    case 'doi': return l.doi(args[0]);
    case 'pdf': return l.pdf(args[0]);
    case 'libraryList': return lb.libraryList(args[0]);
    case 'libraryDetail': return lb.libraryDetail(args[0]);
    case 'libraryAdd': return lb.libraryAdd(args[0]);
    case 'libraryUpdate': return lb.libraryUpdate(args[0], args[1]);
    case 'libraryDelete': return lb.libraryDelete(args[0]);
    case 'libraryBatch': return lb.libraryBatch(args[0], args[1], args[2]);
    case 'libraryImportDoi': return lb.libraryImportDoi(args[0], args[1]);
    case 'subscriptionsList': return s.subscriptionsList();
    case 'subscriptionCreate': return s.subscriptionCreate(args[0]);
    case 'subscriptionUpdate': return s.subscriptionUpdate(args[0], args[1]);
    case 'subscriptionDelete': return s.subscriptionDelete(args[0]);
    case 'subscriptionRun': return s.subscriptionRun(args[0]);
    case 'pushesList': return s.pushesList(args[0]);
    case 'pushesRead': return s.pushesRead(args[0], args[1]);
    case 'categoriesList': return c.categoriesList(args[0]);
    case 'categoryCreate': return c.categoryCreate(args[0], args[1]);
    case 'categoryUpdate': return c.categoryUpdate(args[0], args[1]);
    case 'categoryDelete': return c.categoryDelete(args[0]);
    case 'tagsList': return c.tagsList();
    case 'tagDelete': return c.tagDelete(args[0]);
    case 'wechatList': return w.wechatList(args[0]);
    case 'wechatDetail': return w.wechatDetail(args[0]);
    case 'wechatAdd': return w.wechatAdd(args[0]);
    case 'wechatUpdate': return w.wechatUpdate(args[0], args[1]);
    case 'wechatDelete': return w.wechatDelete(args[0]);
    case 'wechatBatch': return w.wechatBatch(args[0], args[1], args[2]);
  }
}

function tokenHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

export function isMockMode() { return _backendOnline === false; }
