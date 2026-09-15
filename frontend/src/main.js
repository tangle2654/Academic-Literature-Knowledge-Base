import { state } from './store/index.js';
import { applyTheme } from './store/index.js';
import { Layout } from './components/Layout.js';
import { LoginPage } from './views/LoginPage.js';
import { RegisterPage } from './views/RegisterPage.js';
import { SearchPage } from './views/SearchPage.js';
import { SubscriptionPage } from './views/SubscriptionPage.js';
import { LibraryPage } from './views/LibraryPage.js';
import { WechatPage } from './views/WechatPage.js';
import { ProfilePage } from './views/ProfilePage.js';
import { toast } from './components/toast.js';
import { confirmDialog } from './components/confirm.js';

// 路由表
const routes = {
  '#/login': LoginPage,
  '#/register': RegisterPage,
  '#/search': SearchPage,
  '#/subscriptions': SubscriptionPage,
  '#/library': LibraryPage,
  '#/wechat': WechatPage,
  '#/profile': ProfilePage
};

// 允许未登录访问的路由
const publicRoutes = ['#/login', '#/register'];

function getHash() {
  return window.location.hash || (state.token ? '#/search' : '#/login');
}

function navigate(hash) {
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  } else {
    render(); // 强制刷新
  }
}

window.navigate = navigate;

function render() {
  applyTheme();
  const hash = getHash();
  let view = routes[hash];

  if (!view) {
    // 尝试匹配带 query 的
    const baseHash = hash.split('?')[0];
    view = routes[baseHash];
  }

  // 未登录强制跳转
  if (!state.token && !publicRoutes.includes(hash)) {
    window.location.hash = '#/login';
    return;
  }
  // 已登录禁止访问登录注册
  if (state.token && (hash === '#/login' || hash === '#/register' || hash === '')) {
    window.location.hash = '#/search';
    return;
  }

  const app = document.getElementById('app');
  if (!app) return;

  if (!view) {
    app.innerHTML = `<div style="text-align:center;padding:60px;color:#888">页面不存在</div>`;
    return;
  }

  const publicView = publicRoutes.includes(hash);
  if (publicView) {
    app.innerHTML = '';
    view(app, parseQuery(hash));
  } else {
    // 带布局
    app.innerHTML = '';
    const layoutRoot = document.createElement('div');
    app.appendChild(layoutRoot);
    Layout(layoutRoot, () => {
      const contentRoot = document.getElementById('page-content');
      if (contentRoot) view(contentRoot, parseQuery(hash));
    }, parseQuery(hash));
  }
}

function parseQuery(hash) {
  const idx = hash.indexOf('?');
  if (idx < 0) return {};
  const qs = hash.slice(idx + 1);
  const out = {};
  qs.split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return out;
}

// 挂载全局组件
window.toast = toast;
window.confirmDialog = confirmDialog;
window.__API__ = async function() { /* 占位 */ };

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

// 初次加载
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', render);
} else {
  render();
}
