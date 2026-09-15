import '../styles/main.css';
import { api } from '../api/index.js';
import { login } from '../store/index.js';

export function LoginPage(root) {
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <h1>📚 Academic KB</h1>
        <div class="auth-sub">学术文献知识库 · 登录账号</div>
        <form id="login-form">
          <div class="form-group">
            <label>邮箱</label>
            <input type="email" name="email" placeholder="your@email.com" required />
          </div>
          <div class="form-group">
            <label>密码</label>
            <input type="password" name="password" placeholder="请输入密码" required minlength="6" />
          </div>
          <button type="submit" class="btn btn-primary">登 录</button>
        </form>
        <div class="auth-footer">
          还没有账号？<a href="#/register">去注册 →</a>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get('email');
    const password = fd.get('password');
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '登录中...';
    try {
      const { token, user } = await api.login(email, password);
      login(token, user);
      window.toast('登录成功，欢迎回来！', 'success');
      window.location.hash = '#/search';
    } catch (err) {
      window.toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '登 录';
    }
  });
}
