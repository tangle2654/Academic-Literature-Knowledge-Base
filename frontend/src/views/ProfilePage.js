import { state, login, logout } from '../store/index.js';
import { api } from '../api/index.js';

export function ProfilePage(root) {
  let user = state.user || {};
  let stats = { literature_count: 0, subscription_count: 0, wechat_count: 0 };

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h2>个人中心 👤</h2>
        <div class="page-desc">账号设置、修改密码、数据管理</div>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value" id="stat-lit">-</div>
        <div class="stat-label">收藏文献</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat-sub">-</div>
        <div class="stat-label">订阅任务</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat-wx">-</div>
        <div class="stat-label">公众号链接</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3 class="card-title">基本信息</h3>
      <div class="form-row">
        <div class="form-group">
          <label>邮箱（不可修改）</label>
          <input type="email" value="${escapeHtml(user.email || '')}" disabled />
        </div>
        <div class="form-group">
          <label>注册时间</label>
          <input type="text" value="${escapeHtml(user.created_at || '')}" disabled />
        </div>
      </div>
      <div class="form-group">
        <label>昵称</label>
        <input type="text" id="nickname" value="${escapeHtml(user.nickname || '')}" placeholder="给自己起个昵称吧" />
      </div>
      <button class="btn btn-primary" id="btn-save-basic">保存基本信息</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3 class="card-title">修改密码</h3>
      <div class="form-row">
        <div class="form-group">
          <label>原密码</label>
          <input type="password" id="old-pwd" placeholder="请输入原密码" />
        </div>
        <div class="form-group">
          <label>新密码（至少 6 位）</label>
          <input type="password" id="new-pwd" placeholder="请输入新密码" minlength="6" />
        </div>
      </div>
      <button class="btn btn-primary" id="btn-change-pwd">修改密码</button>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3 class="card-title">数据备份与恢复</h3>
      <p style="color:var(--text-secondary);font-size:13px;margin:0 0 16px 0">一键导出你的全部数据（文献、订阅、公众号链接、分类、标签）为 JSON 备份文件，可离线保存。</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" id="btn-export">📥 导出全部数据为 JSON</button>
        <button class="btn btn-outline" id="btn-login-json">📄 查看 JSON 内容</button>
      </div>
      <pre id="json-preview" style="display:none;margin-top:12px;background:var(--bg);padding:12px;border-radius:var(--radius);max-height:300px;overflow:auto;font-size:12px"></pre>
    </div>

    <div class="card" style="border-color:var(--danger)">
      <h3 class="card-title" style="color:var(--danger)">危险操作</h3>
      <p style="color:var(--text-secondary);font-size:13px;margin:0 0 16px 0">退出当前账号登录。你的数据不会丢失，下次登录即可继续使用。</p>
      <button class="btn btn-danger" id="btn-logout">🚪 退出登录</button>
    </div>
  `;

  async function init() {
    loadStats();
    loadUser();
  }

  async function loadStats() {
    try {
      const [lib, subs, wx] = await Promise.all([
        api.libraryList({ page: 1, perPage: 1 }),
        api.subscriptionsList(),
        api.wechatList({ page: 1, perPage: 1 })
      ]);
      stats.literature_count = lib.total || 0;
      stats.subscription_count = subs.length || 0;
      stats.wechat_count = wx.total || 0;
      root.querySelector('#stat-lit').textContent = stats.literature_count;
      root.querySelector('#stat-sub').textContent = stats.subscription_count;
      root.querySelector('#stat-wx').textContent = stats.wechat_count;
    } catch {}
  }

  async function loadUser() {
    try {
      const { user: u } = await api.me();
      user = u;
      login(state.token, u); // 更新 store
      root.querySelector('#nickname').value = u.nickname || '';
    } catch {}
  }

  // 保存基本信息
  root.querySelector('#btn-save-basic').onclick = async () => {
    const nickname = root.querySelector('#nickname').value.trim();
    try {
      const { user: u } = await api.updateMe({ nickname });
      login(state.token, u);
      window.toast('已保存', 'success');
    } catch (err) { window.toast(err.message, 'error'); }
  };

  // 修改密码
  root.querySelector('#btn-change-pwd').onclick = async () => {
    const oldPwd = root.querySelector('#old-pwd').value;
    const newPwd = root.querySelector('#new-pwd').value;
    if (!oldPwd || !newPwd) { window.toast('请填写原密码和新密码', 'warning'); return; }
    if (newPwd.length < 6) { window.toast('新密码至少 6 位', 'warning'); return; }
    root.querySelector('#btn-change-pwd').disabled = true;
    try {
      await api.updateMe({ oldPassword: oldPwd, newPassword: newPwd });
      window.toast('密码修改成功', 'success');
      root.querySelector('#old-pwd').value = '';
      root.querySelector('#new-pwd').value = '';
    } catch (err) {
      window.toast(err.message, 'error');
    } finally {
      root.querySelector('#btn-change-pwd').disabled = false;
    }
  };

  // 导出 JSON
  root.querySelector('#btn-export').onclick = async () => {
    try {
      const resp = await fetch('/api/auth/export', {
        headers: { Authorization: `Bearer ${state.token}` }
      });
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `knowledge-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      window.toast('导出成功！', 'success');
    } catch (err) {
      window.toast('导出失败：' + err.message, 'error');
    }
  };

  root.querySelector('#btn-login-json').onclick = async () => {
    const preview = root.querySelector('#json-preview');
    if (preview.style.display === 'block') {
      preview.style.display = 'none'; return;
    }
    try {
      const data = await api.exportData();
      preview.textContent = JSON.stringify(data, null, 2);
      preview.style.display = 'block';
    } catch (err) {
      window.toast(err.message, 'error');
    }
  };

  // 退出登录
  root.querySelector('#btn-logout').onclick = async () => {
    if (await window.confirmDialog('确定要退出登录吗？')) {
      logout();
      window.location.hash = '#/login';
    }
  };

  init();
}

function escapeHtml(s) { return String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]); }
