import '../styles/main.css';
import { api } from '../api/index.js';
import { login } from '../store/index.js';

function checkStrength(pwd) {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;
  return score;
}

export function RegisterPage(root) {
  root.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <h1>📚 注册新账号</h1>
        <div class="auth-sub">创建属于你的专属学术文献知识库</div>
        <form id="register-form">
          <div class="form-group">
            <label>昵称（可选）</label>
            <input type="text" name="nickname" placeholder="怎么称呼你好？" />
          </div>
          <div class="form-group">
            <label>邮箱</label>
            <input type="email" name="email" placeholder="your@email.com" required />
          </div>
          <div class="form-group">
            <label>密码</label>
            <input type="password" name="password" id="pwd" placeholder="至少6位，建议包含字母和数字" required minlength="6" />
            <div id="strength" style="font-size:12px;margin-top:6px"></div>
          </div>
          <div class="form-group">
            <label>确认密码</label>
            <input type="password" name="confirm" placeholder="再次输入密码" required />
          </div>
          <button type="submit" class="btn btn-primary">注 册</button>
        </form>
        <div class="auth-footer">
          已有账号？<a href="#/login">去登录 →</a>
        </div>
      </div>
    </div>
  `;

  const pwdInput = root.querySelector('#pwd');
  const strengthEl = root.querySelector('#strength');
  pwdInput.addEventListener('input', () => {
    const score = checkStrength(pwdInput.value);
    const levels = ['太弱', '弱', '中等', '较强', '强'];
    const colors = ['#ef4444', '#f59e0b', '#f59e0b', '#10b981', '#10b981'];
    strengthEl.textContent = `密码强度：${levels[score]}`;
    strengthEl.style.color = colors[score];
  });

  root.querySelector('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get('email');
    const nickname = fd.get('nickname');
    const password = fd.get('password');
    const confirm = fd.get('confirm');

    if (password !== confirm) {
      window.toast('两次密码输入不一致', 'error'); return;
    }
    if (password.length < 6) {
      window.toast('密码至少 6 位', 'error'); return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = '注册中...';
    try {
      const { token, user } = await api.register(email, password, nickname);
      login(token, user);
      window.toast('注册成功！已为你初始化知识库', 'success');
      window.location.hash = '#/search';
    } catch (err) {
      window.toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = '注 册';
    }
  });
}
