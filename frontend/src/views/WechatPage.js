import { api } from '../api/index.js';

export function WechatPage(root) {
  let categories = [];
  let links = [];
  let currentCategoryId = null;
  let currentTag = null;
  let selectedIds = new Set();
  let page = 1;
  let total = 0;

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h2>公众号收藏 📱</h2>
        <div class="page-desc">保存微信公众号文章链接，自动抓取标题与摘要，按主题分类管理</div>
      </div>
      <button class="btn btn-primary btn-sm" id="btn-add">+ 添加公众号链接</button>
    </div>

    <div class="layout-with-sidebar">
      <aside class="sidebar">
        <h4>主题分类</h4>
        <div id="cat-list"></div>
        <button class="btn btn-outline btn-sm sidebar-add" id="btn-newcat">+ 新建分类</button>
      </aside>

      <div>
        <form id="filter-bar" class="search-bar">
          <input type="text" id="q" placeholder="搜索标题、备注、标签..." />
          <button class="btn btn-primary btn-sm" type="submit">搜索</button>
        </form>

        <div id="bulk-bar" class="bulk-bar" style="display:none">
          <span class="selected-info">已选 <span id="sel-count">0</span> 项</span>
          <button class="btn btn-sm" id="bulk-move">移动到...</button>
          <button class="btn btn-danger btn-sm" id="bulk-delete">批量删除</button>
          <button class="btn btn-sm" id="bulk-clear" style="margin-left:auto">取消选择</button>
        </div>

        <div id="link-list"></div>
        <div id="pagination" class="pagination"></div>
      </div>
    </div>
  `;

  async function init() {
    await loadCategories();
    await loadList();
  }

  async function loadCategories() {
    try {
      categories = await api.categoriesList('wechat');
      // 如果没有专属分类，也显示文献分类共用
      const litCats = await api.categoriesList('literature');
      categories = [...categories, ...litCats.filter(c => !categories.find(x => x.id === c.id))];
    } catch (err) { window.toast(err.message, 'error'); }
    renderSidebar();
  }

  function renderSidebar() {
    const el = root.querySelector('#cat-list');
    el.innerHTML = `
      <div class="sidebar-item ${currentCategoryId === null ? 'active' : ''}" data-cat="">
        <span>📖 全部链接</span>
      </div>
      ${categories.map(c => `
        <div class="sidebar-item ${currentCategoryId === c.id ? 'active' : ''}" data-cat="${c.id}">
          <span>${escapeHtml(c.name)}</span>
          <span class="actions">
            <button data-edit="${c.id}">✏️</button>
            <button data-del="${c.id}">🗑️</button>
          </span>
        </div>
      `).join('')}
    `;
    el.querySelectorAll('[data-cat]').forEach(item => {
      item.onclick = (e) => {
        if (e.target.dataset.edit) { editCategory(Number(e.target.dataset.edit)); return; }
        if (e.target.dataset.del) { delCategory(Number(e.target.dataset.del)); return; }
        currentCategoryId = item.dataset.cat === '' ? null : Number(item.dataset.cat);
        page = 1; loadList(); renderSidebar();
      };
    });
  }

  async function loadList() {
    const listEl = root.querySelector('#link-list');
    listEl.innerHTML = `<div class="loading">加载中</div>`;
    const params = { page, perPage: 20 };
    if (currentCategoryId) params.categoryId = currentCategoryId;
    const q = root.querySelector('#q').value.trim();
    if (q) params.q = q;

    try {
      const data = await api.wechatList(params);
      links = data.results || [];
      total = data.total || 0;
      listEl.innerHTML = '';

      if (links.length === 0) {
        listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div>
          ${currentCategoryId ? '该分类下暂无链接' : '还没有收藏的公众号文章，点击右上角「+ 添加」开始吧'}
        </div>`;
        renderPagination();
        renderBulkBar();
        return;
      }

      const container = document.createElement('div');
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '10px';

      links.forEach(item => {
        container.appendChild(renderLinkCard(item));
      });
      listEl.appendChild(container);
      renderPagination();
      renderBulkBar();
    } catch (err) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div>${err.message}</div>`;
    }
  }

  function renderLinkCard(item) {
    const div = document.createElement('div');
    div.className = 'link-card';
    div.innerHTML = `
      <input type="checkbox" class="link-check" data-id="${item.id}" style="margin-top:10px"/>
      <div class="link-icon">💬</div>
      <div class="link-info">
        <div class="link-title">${escapeHtml(item.title || '(未抓取到标题)')}</div>
        <div class="link-meta">
          <span>📅 ${item.published_at || '-'}</span>
          <span>🔗 <a href="${escapeHtml(item.url)}" target="_blank" style="color:var(--text-secondary)">打开原文 →</a></span>
          <span style="margin-left:auto">
            <button class="btn btn-xs" data-edit="${item.id}">编辑</button>
            <button class="btn btn-danger btn-xs" data-del="${item.id}">删除</button>
          </span>
        </div>
        ${item.summary ? `<div class="link-summary">${escapeHtml(item.summary)}</div>` : ''}
        ${item.note ? `<div class="link-summary" style="color:var(--text-muted)"><b>备注：</b>${escapeHtml(item.note)}</div>` : ''}
        ${Array.isArray(item.tags) && item.tags.length > 0 ? `
          <div class="paper-tags">${item.tags.map(t => `<span class="paper-tag">${escapeHtml(t)}</span>`).join('')}</div>
        ` : ''}
      </div>
    `;

    div.querySelector('.link-check').onchange = (e) => {
      if (e.target.checked) selectedIds.add(item.id); else selectedIds.delete(item.id);
      renderBulkBar();
    };
    div.querySelector('[data-edit]').onclick = () => showEditDialog(item.id);
    div.querySelector('[data-del]').onclick = async () => {
      if (await window.confirmDialog('确定删除这条链接？')) {
        await api.wechatDelete(item.id);
        window.toast('已删除', 'success');
        loadList();
      }
    };

    return div;
  }

  function renderPagination() {
    const pag = root.querySelector('#pagination');
    const totalPages = Math.min(100, Math.ceil(total / 20));
    if (totalPages <= 1) { pag.innerHTML = ''; return; }
    let html = `<button class="btn btn-sm" ${page === 1 ? 'disabled' : ''} data-go="${page - 1}">上一页</button>`;
    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
      html += `<button class="btn btn-sm ${i === page ? 'btn-primary' : ''}" data-go="${i}">${i}</button>`;
    }
    html += `<button class="btn btn-sm" ${page === totalPages ? 'disabled' : ''} data-go="${page + 1}">下一页</button>`;
    pag.innerHTML = html;
    pag.querySelectorAll('[data-go]').forEach(btn => {
      btn.onclick = () => { page = Number(btn.dataset.go); loadList(); };
    });
  }

  function renderBulkBar() {
    const bar = root.querySelector('#bulk-bar');
    if (selectedIds.size > 0) {
      bar.style.display = 'flex';
      root.querySelector('#sel-count').textContent = selectedIds.size;
    } else {
      bar.style.display = 'none';
    }
  }

  // ========== 添加链接弹窗 ==========
  function showAddDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box" style="min-width:480px">
        <h3>添加公众号链接</h3>
        <div class="form-group">
          <label>公众号文章 URL</label>
          <input type="url" id="input-url" placeholder="https://mp.weixin.qq.com/s/xxx" />
        </div>
        <div class="form-group">
          <label>标题（可选，不填则自动抓取）</label>
          <input type="text" id="input-title" placeholder="" />
        </div>
        <div class="form-group">
          <label>备注说明</label>
          <textarea id="input-note" rows="2" placeholder="添加你自己的笔记或备注"></textarea>
        </div>
        <div class="form-group">
          <label>标签（用逗号分隔）</label>
          <input type="text" id="input-tags" placeholder="例如：AI, 产品, 随笔" />
        </div>
        <div class="form-group">
          <label>归入分类</label>
          <select id="input-cat" style="width:100%">
            <option value="">不归类</option>
            ${categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-close>取消</button>
          <button class="btn btn-primary" data-submit>保存并抓取</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-close]').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('[data-submit]').onclick = async () => {
      const url = overlay.querySelector('#input-url').value.trim();
      if (!url) { window.toast('请输入 URL', 'warning'); return; }
      const payload = {
        url,
        title: overlay.querySelector('#input-title').value.trim() || undefined,
        note: overlay.querySelector('#input-note').value.trim(),
        tags: overlay.querySelector('#input-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
        category_id: overlay.querySelector('#input-cat').value || undefined
      };
      overlay.querySelector('[data-submit]').disabled = true;
      overlay.querySelector('[data-submit]').textContent = '保存中...';
      try {
        await api.wechatAdd(payload);
        window.toast('已添加', 'success');
        overlay.remove();
        loadList();
      } catch (err) {
        window.toast(err.message, 'error');
        overlay.querySelector('[data-submit]').disabled = false;
        overlay.querySelector('[data-submit]').textContent = '保存并抓取';
      }
    };
  }

  async function showEditDialog(id) {
    try {
      const item = await api.wechatDetail(id);
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-box">
          <h3>编辑链接</h3>
          <div class="form-group">
            <label>标题</label>
            <input type="text" id="input-title" value="${escapeHtml(item.title || '')}" />
          </div>
          <div class="form-group">
            <label>备注</label>
            <textarea id="input-note" rows="2">${escapeHtml(item.note || '')}</textarea>
          </div>
          <div class="form-group">
            <label>标签（逗号分隔）</label>
            <input type="text" id="input-tags" value="${escapeHtml(Array.isArray(item.tags) ? item.tags.join(', ') : '')}" />
          </div>
          <div class="form-group">
            <label>归入分类</label>
            <select id="input-cat" style="width:100%">
              <option value="">不归类</option>
              ${categories.map(c => `<option value="${c.id}" ${item.category_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
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
        await api.wechatUpdate(id, {
          title: overlay.querySelector('#input-title').value,
          note: overlay.querySelector('#input-note').value,
          tags: overlay.querySelector('#input-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean),
          category_id: overlay.querySelector('#input-cat').value || null
        });
        window.toast('已保存', 'success');
        overlay.remove();
        loadList();
      };
    } catch (err) {
      window.toast(err.message, 'error');
    }
  }

  // 事件
  root.querySelector('#btn-add').onclick = showAddDialog;
  root.querySelector('#btn-newcat').onclick = async () => {
    const name = prompt('输入分类名称：');
    if (!name) return;
    await api.categoryCreate(name, 'wechat');
    window.toast('已创建', 'success');
    await loadCategories();
  };
  root.querySelector('#filter-bar').addEventListener('submit', (e) => { e.preventDefault(); page = 1; loadList(); });

  root.querySelector('#bulk-bar').addEventListener('click', async (e) => {
    if (e.target.id === 'bulk-clear') { selectedIds.clear(); renderBulkBar(); loadList(); return; }
    if (e.target.id === 'bulk-delete') {
      if (await window.confirmDialog(`确定删除选中的 ${selectedIds.size} 条链接？`)) {
        await api.wechatBatch('delete', [...selectedIds]);
        selectedIds.clear();
        window.toast('已删除', 'success');
        loadList();
      }
    } else if (e.target.id === 'bulk-move') {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-box" style="max-width:360px">
          <h3>移动到分类</h3>
          <select id="move-cat" style="width:100%">
            <option value="">未分类</option>
            ${categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
          <div class="modal-actions">
            <button class="btn btn-secondary" data-close>取消</button>
            <button class="btn btn-primary" data-submit>确认</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('[data-close]').onclick = () => overlay.remove();
      overlay.querySelector('[data-submit]').onclick = async () => {
        const catId = overlay.querySelector('#move-cat').value;
        await api.wechatBatch('move', [...selectedIds], catId || null);
        selectedIds.clear();
        overlay.remove();
        loadList();
        window.toast('已移动', 'success');
      };
    }
  });

  init();
}

function escapeHtml(s) { return String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]); }
