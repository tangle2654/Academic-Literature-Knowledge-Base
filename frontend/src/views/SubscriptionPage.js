import { api } from '../api/index.js';
import { renderPaperCard } from '../components/PaperCard.js';

export function SubscriptionPage(root) {
  let subscriptions = [];
  let pushes = [];
  let loadingSub = false;

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h2>我的订阅 📨</h2>
        <div class="page-desc">创建主题订阅，自动推送最新文献到你的专属推送列表</div>
      </div>
      <button class="btn btn-primary" id="btn-create">+ 新建订阅</button>
    </div>

    <div class="form-group" style="margin-bottom:16px">
      <label>筛选推送列表</label>
      <select id="filter-subscription" style="max-width:320px">
        <option value="">全部订阅</option>
      </select>
      <button class="btn btn-outline btn-sm" id="btn-readall" style="margin-left:10px">一键标记已读</button>
    </div>

    <h4 style="margin:16px 0 8px 0;color:var(--text-secondary);font-size:13px;text-transform:uppercase">订阅任务</h4>
    <div id="sub-list"></div>

    <h4 style="margin:24px 0 8px 0;color:var(--text-secondary);font-size:13px;text-transform:uppercase">推送文献</h4>
    <div id="push-list" class="paper-list"></div>
  `;

  const filterSel = root.querySelector('#filter-subscription');

  async function loadAll() {
    loadingSub = true;
    const list = root.querySelector('#sub-list');
    list.innerHTML = `<div class="loading">加载中</div>`;
    try {
      subscriptions = await api.subscriptionsList();
      pushes = await api.pushesList();
      renderSubscriptions();
      renderPushes();
      // 更新 filter
      filterSel.innerHTML = '<option value="">全部订阅</option>' +
        subscriptions.map(s => `<option value="${s.id}">${escapeHtml(s.topic)}</option>`).join('');
    } catch (err) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div>加载失败：${err.message}</div>`;
    } finally {
      loadingSub = false;
    }
  }

  function renderSubscriptions() {
    const list = root.querySelector('#sub-list');
    if (subscriptions.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div>暂无订阅任务，点击右上角「+ 新建订阅」开始吧</div>`;
      return;
    }
    list.innerHTML = subscriptions.map(s => {
      const freqMap = { daily: '每日', weekly: '每周', biweekly: '每两周' };
      return `
        <div class="sub-card">
          <div class="sub-topic">📌 ${escapeHtml(s.topic)}</div>
          <div class="sub-meta">
            <span>⏰ ${freqMap[s.frequency] || s.frequency} 推送</span>
            <span>🏆 ${s.jcr_filter || '不限'} 分区</span>
            <span class="sub-status ${s.is_active ? 'active' : 'paused'}">${s.is_active ? '运行中' : '已暂停'}</span>
            ${s.last_run ? `<span>上次推送：${s.last_run}</span>` : ''}
          </div>
          <div class="sub-actions">
            <button class="btn btn-primary btn-sm" data-run="${s.id}">立即推送</button>
            <button class="btn btn-outline btn-sm" data-toggle="${s.id}">${s.is_active ? '暂停' : '恢复'}</button>
            <button class="btn btn-sm" data-edit="${s.id}">编辑</button>
            <button class="btn btn-danger btn-sm" data-del="${s.id}">删除</button>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-run]').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = '推送中...';
        try {
          const r = await api.subscriptionRun(Number(btn.dataset.run));
          window.toast(`推送完成：新增 ${r.added} 篇文献`, 'success');
          await loadAll();
        } catch (err) {
          window.toast(err.message, 'error');
        } finally {
          btn.disabled = false; btn.textContent = '立即推送';
        }
      };
    });
    list.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.onclick = async () => {
        await api.subscriptionUpdate(Number(btn.dataset.toggle), { is_active: subscriptions.find(s => s.id === Number(btn.dataset.toggle)).is_active ? false : true });
        await loadAll();
      };
    });
    list.querySelectorAll('[data-edit]').forEach(btn => {
      btn.onclick = () => showEditModal(Number(btn.dataset.edit));
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.onclick = async () => {
        if (await window.confirmDialog('确定删除这个订阅任务？')) {
          await api.subscriptionDelete(Number(btn.dataset.del));
          window.toast('已删除', 'success');
          await loadAll();
        }
      };
    });
  }

  function renderPushes() {
    const list = root.querySelector('#push-list');
    const filter = filterSel.value;
    let show = pushes;
    if (filter) show = pushes.filter(p => p.subscription_id === Number(filter));

    if (show.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div>暂无推送文献，创建订阅后会自动推送最新文献</div>`;
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'paper-list';
    show.forEach(item => {
      renderPaperCard(grid, {
        doi: item.doi,
        title: item.title,
        authors: item.authors,
        journal: item.journal,
        published_date: item.published_date,
        abstract_en: item.abstract_en,
        abstract_zh: item.abstract_zh,
        jcr_quarter: item.jcr_quarter,
        pdf_url: item.pdf_url,
        source_url: item.source_url
      }, {
        showNew: item.is_new === 1,
        showSave: true
      });
    });
    list.innerHTML = '';
    list.appendChild(grid);
  }

  function showCreateModal() {
    showModal({
      title: '新建订阅任务',
      fields: [
        { key: 'topic', label: '订阅主题关键词', placeholder: '例如：graph neural networks' },
        { key: 'frequency', label: '推送频率', type: 'select', options: [
          { value: 'daily', label: '每日推送' },
          { value: 'weekly', label: '每周推送' },
          { value: 'biweekly', label: '每两周推送' }
        ]},
        { key: 'jcr_filter', label: 'JCR 分区筛选', type: 'select', options: [
          { value: 'all', label: '不限' },
          { value: 'Q1', label: 'Q1' },
          { value: 'Q2', label: 'Q2' },
          { value: 'Q3', label: 'Q3' },
          { value: 'Q4', label: 'Q4' }
        ]}
      ],
      submit: async (data) => {
        await api.subscriptionCreate(data);
        window.toast('订阅创建成功！', 'success');
        await loadAll();
      }
    });
  }

  function showEditModal(id) {
    const s = subscriptions.find(x => x.id === id);
    if (!s) return;
    showModal({
      title: '编辑订阅',
      defaults: s,
      fields: [
        { key: 'topic', label: '订阅主题关键词', placeholder: '例如：graph neural networks' },
        { key: 'frequency', label: '推送频率', type: 'select', options: [
          { value: 'daily', label: '每日推送' },
          { value: 'weekly', label: '每周推送' },
          { value: 'biweekly', label: '每两周推送' }
        ]},
        { key: 'jcr_filter', label: 'JCR 分区筛选', type: 'select', options: [
          { value: 'all', label: '不限' },
          { value: 'Q1', label: 'Q1' },
          { value: 'Q2', label: 'Q2' },
          { value: 'Q3', label: 'Q3' },
          { value: 'Q4', label: 'Q4' }
        ]}
      ],
      submit: async (data) => {
        await api.subscriptionUpdate(id, data);
        window.toast('已更新', 'success');
        await loadAll();
      }
    });
  }

  function showModal({ title, fields, defaults = {}, submit }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>${title}</h3>
        ${fields.map(f => {
          if (f.type === 'select') {
            return `<div class="form-group">
              <label>${f.label}</label>
              <select name="${f.key}">
                ${f.options.map(o => `<option value="${o.value}" ${defaults[f.key] === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
              </select>
            </div>`;
          }
          return `<div class="form-group">
            <label>${f.label}</label>
            <input type="text" name="${f.key}" value="${escapeHtml(defaults[f.key] || '')}" placeholder="${f.placeholder || ''}" ${f.key === 'topic' ? 'required' : ''} />
          </div>`;
        }).join('')}
        <div class="modal-actions">
          <button class="btn btn-secondary" data-close>取消</button>
          <button class="btn btn-primary" data-submit>保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-close]').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('[data-submit]').onclick = async () => {
      const data = {};
      fields.forEach(f => data[f.key] = overlay.querySelector(`[name="${f.key}"]`).value);
      try {
        await submit(data);
        overlay.remove();
      } catch (err) {
        window.toast(err.message, 'error');
      }
    };
  }

  filterSel.addEventListener('change', renderPushes);
  root.querySelector('#btn-create').addEventListener('click', showCreateModal);
  root.querySelector('#btn-readall').addEventListener('click', async () => {
    await api.pushesRead([], true);
    pushes = pushes.map(p => ({ ...p, is_read: 1, is_new: 0 }));
    renderPushes();
    window.toast('已全部标记为已读', 'success');
  });

  loadAll();
}

function escapeHtml(s) { return String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]); }
