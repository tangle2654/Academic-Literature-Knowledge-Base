import { state, toggleTheme, logout } from '../store/index.js';

const NAV_ITEMS = [
  { key: 'search', label: '文献检索', icon: '🔍', hash: '#/search' },
  { key: 'subscriptions', label: '我的订阅', icon: '📨', hash: '#/subscriptions' },
  { key: 'library', label: '我的文献库', icon: '📚', hash: '#/library' },
  { key: 'wechat', label: '公众号收藏', icon: '📱', hash: '#/wechat' },
  { key: 'profile', label: '个人中心', icon: '👤', hash: '#/profile' }
];

export function Layout(root, onReady) {
  const hash = window.location.hash || '#/search';
  const active = hash.split('?')[0].replace('#/', '');

  root.innerHTML = `
    <div class="layout">
      <header class="navbar">
        <div class="nav-brand">
          <span class="logo">📖</span>
          <span class="brand-text">Academic KB</span>
          <span class="brand-sub">学术文献知识库</span>
        </div>
        <nav class="nav-items">
          ${NAV_ITEMS.map(item => `
            <a href="${item.hash}" class="nav-item ${active === item.key ? 'active' : ''}">
              <span class="nav-icon">${item.icon}</span>
              <span>${item.label}</span>
            </a>
          `).join('')}
        </nav>
        <div class="nav-right">
          <button class="theme-toggle" title="切换主题">${state.theme === 'light' ? '🌙' : '☀️'}</button>
          <div class="user-menu">
            <span class="user-avatar">${(state.user && state.user.nickname || state.user && state.user.email || 'U').slice(0, 1).toUpperCase()}</span>
            <span class="user-name">${(state.user && (state.user.nickname || state.user.email)) || '用户'}</span>
            <button class="logout-btn" title="退出登录">🚪</button>
          </div>
        </div>
      </header>
      <main id="page-content" class="page-content"></main>
    </div>
  `;

  root.querySelector('.theme-toggle').addEventListener('click', () => {
    toggleTheme();
    root.querySelector('.theme-toggle').textContent = state.theme === 'light' ? '🌙' : '☀️';
  });

  root.querySelector('.logout-btn').addEventListener('click', () => {
    window.confirmDialog('确定要退出登录吗？').then(ok => {
      if (ok) {
        logout();
        window.location.hash = '#/login';
      }
    });
  });

  onReady && onReady();
}
