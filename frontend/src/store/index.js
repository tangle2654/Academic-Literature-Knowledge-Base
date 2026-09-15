// 全局状态管理（简单的事件总线 + 本地持久化）
import { reactive } from '../reactive.js';

const STORAGE_KEY = 'akb_state';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function persist() {
  const toSave = {
    token: state.token,
    user: state.user,
    theme: state.theme
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

const persisted = load();

export const state = reactive({
  token: persisted.token || null,
  user: persisted.user || null,
  theme: persisted.theme || 'light',
  categories: [],
  tags: []
});

// 监听变化自动持久化
const origSet = state.set.bind(state);
state.set = function(key, val) {
  origSet(key, val);
  persist();
};

export function login(token, user) {
  state.token = token;
  state.user = user;
  persist();
}

export function logout() {
  state.token = null;
  state.user = null;
  persist();
}

export function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  persist();
  applyTheme();
}

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
}
