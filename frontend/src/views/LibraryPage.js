import { api } from '../api/index.js';
import { renderPaperCard } from '../components/PaperCard.js';
import { showExportDialog } from '../components/citation.js';

export function LibraryPage(root, query) {
  let categories = [];
  let tags = [];
  let papers = [];
  let currentCategoryId = null;
  let currentTag = null;
  let viewMode = 'list';
  let selectedIds = new Set();
  let page = 1;
  let total = 0;

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h2>我的文献库 📚</h2>
        <div class="page-desc">收藏文献、阅读笔记、标签评分、引用导出</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" id="btn-import">📥 DOI 批量导入</button>
        <button class="btn btn-primary btn-sm" id="btn-newcat">+ 新建主题</button>
      </div>
    </div>

    <div class="layout-with-sidebar">
      <aside class="sidebar" id="sidebar">
        <h4>主题分类</h4>
        <div id="cat-list"></div>
        <h4 style="margin-top:16px">标签</h4>
        <div id="tag-list" style="display:flex;flex-wrap:wrap;gap:4px"></div>
        <button class="btn btn-outline btn-sm sidebar-add" id="btn-newcat2">+ 新建主题</button>
      </aside>

      <div>
        <form id="filter-bar" class="search-bar">
          <input type="text" id="q" placeholder="搜索文献标题、摘要、笔记..." />
          <select id="sort">
            <option value="created_at">按添加时间</option>
            <option value="published_date">按发表时间</option>
            <option value="title">按标题</option>
            <option value="rating">按评分</option>
          </select>
          <select id="order">
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm" id="view-list">📋 列表</button>
            <button class="btn btn-sm" id="view-grid">🔲 网格</button>
          </div>
          <button class="btn btn-primary btn-sm" type="submit">筛选</button>
        </form>

        <div id="bulk-bar" class="bulk-bar" style="display:none">
          <input type="checkbox" id="select-all"/>
          <span class="selected-info">已选 <span id="sel-count">0</span> 项</span>
          <button class="btn btn-sm" id="bulk-move">移动到...</button>
          <button class="btn btn-sm" id="bulk-export">📝 批量导出引用</button>
          <button class="btn btn-danger btn-sm" id="bulk-delete">批量删除</button>
          <button class="btn btn-sm" id="bulk-clear" style="margin-left:auto">取消选择</button>
        </div>

        <div id="paper-results" class="paper-list"></div>
        <div id="pagination" class="pagination"></div>
      </div>
    </div>
  `;

  // 初始选中默认分类
  async function init() {
    await loadCategories();
    if (query && query.categoryId) currentCategoryId = Number(query.categoryId);
    if (!currentCategoryId && categories.length > 0) currentCategoryId = null; // null 表示全部
    await loadList();
    await loadTags();
  }

  async function loadCategories() {
    try {
      categories = await api.categoriesList('literature');
    } catch (err) { window.toast(err.message, 'error'); }
    renderSidebar();
  }

  async function loadTags() {
    try { tags = await api.tagsList(); } catch {}
    renderSidebar();
  }

  function renderSidebar() {
    const catEl = root.querySelector('#cat-list');
    const tagEl = root.querySelector('#tag-list');

    // 计算每个分类的数量
    const counts = {};
    root.querySelectorAll('.paper-card').forEach(card => {}); // 不实时计数，简单处理

    catEl.innerHTML = `
      <div class="sidebar-item ${currentCategoryId === null ? 'active' : ''}" data-cat="">
        <span>📖 全部文献</span>
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

    catEl.querySelectorAll('[data-cat]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.dataset.edit) { editCategory(Number(e.target.dataset.edit)); return; }
        if (e.target.dataset.del) { delCategory(Number(e.target.dataset.del)); return; }
        currentCategoryId = el.dataset.cat === '' ? null : Number(el.dataset.cat);
        page = 1;
        loadList();
        renderSidebar();
      };
    });

    if (tags.length > 0) {
      tagEl.innerHTML = tags.map(t => `
        <span class="paper-tag" style="cursor:pointer${currentTag === t.name ? ';outline:2px solid var(--primary)' : ''}" data-tag="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>
      `).join('') + (currentTag ? `<span class="paper-tag" style="background:#fee2e2;color:#991b1b;cursor:pointer" data-clear-tag>清除</span>` : '');
      tagEl.querySelectorAll('[data-tag]').forEach(el => {
        el.onclick = () => { currentTag = el.dataset.tag; page = 1; loadList(); renderSidebar(); };
      });
      tagEl.querySelector('[data-clear-tag]')?.addEventListener('click', () => { currentTag = null; page = 1; loadList(); renderSidebar(); });
    } else {
      tagEl.innerHTML = `<span style="font-size:12px;color:var(--text-muted)">暂无标签</span>`;
    }
  }

  async function loadList() {
    const listEl = root.querySelector('#paper-results');
    listEl.innerHTML = `<div class="loading">加载中</div>`;

    const params = {
      page,
      perPage: 20,
      sortBy: root.querySelector('#sort').value,
      order: root.querySelector('#order').value
    };
    if (currentCategoryId) params.categoryId = currentCategoryId;
    if (currentTag) params.tag = currentTag;
    const q = root.querySelector('#q').value.trim();
    if (q) params.q = q;

    try {
      const data = await api.libraryList(params);
      papers = data.results || [];
      total = data.total || 0;

      listEl.innerHTML = '';
      if (papers.length === 0) {
        listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div>
          ${currentCategoryId ? '该主题分类下还没有文献' : '文献库空空如也，去「文献检索」收藏一些吧'}
        </div>`;
        renderPagination();
        renderBulkBar();
        return;
      }

      const container = document.createElement('div');
      container.className = viewMode === 'grid' ? 'paper-grid' : 'paper-list';
      papers.forEach(item => {
        renderPaperCard(container, item, {
          showAbstract: true,
          showCheckBox: true,
          selected: selectedIds.has(item.id),
          onToggleSelect: (it, checked) => {
            if (checked) selectedIds.add(it.id); else selectedIds.delete(it.id);
            renderBulkBar();
          }
        });
      });
      listEl.appendChild(container);
      attachCardActions();
      renderPagination();
      renderBulkBar();
    } catch (err) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div>${err.message}</div>`;
    }
  }

  function attachCardActions() {
    // 给卡片上的引用、笔记、删除按钮添加事件
    root.querySelectorAll('#paper-results .paper-card').forEach((card, idx) => {
      const item = papers[idx];
      if (!item) return;

      // 星评
      card.querySelectorAll('.paper-rating .star').forEach((star, n) => {
        star.onclick = async () => {
          const rating = n + 1;
          try {
            await api.libraryUpdate(item.id, { rating });
            item.rating = rating;
            card.querySelectorAll('.paper-rating .star').forEach((s, m) => {
              s.classList.toggle('empty', m >= rating);
            });
            window.toast(`评分：${rating} 星`, 'success');
          } catch (err) { window.toast(err.message, 'error'); }
        };
      });
    });
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

  // 事件绑定
  root.querySelector('#filter-bar').addEventListener('submit', (e) => {
    e.preventDefault(); page = 1; loadList();
  });
  root.querySelector('#view-list').onclick = () => { viewMode = 'list'; loadList(); };
  root.querySelector('#view-grid').onclick = () => { viewMode = 'grid'; loadList(); };
  root.querySelector('#btn-newcat').onclick = () => createCategory();
  root.querySelector('#btn-newcat2').onclick = () => createCategory();

  root.querySelector('#bulk-bar').addEventListener('click', async (e) => {
    if (e.target.id === 'bulk-clear') { selectedIds.clear(); renderBulkBar(); loadList(); return; }
    if (e.target.id === 'bulk-delete') {
      if (await window.confirmDialog(`确定删除选中的 ${selectedIds.size} 篇文献？此操作不可恢复`)) {
        await api.libraryBatch('delete', [...selectedIds]);
        selectedIds.clear();
        window.toast('已删除', 'success');
        loadList(); loadTags();
      }
    } else if (e.target.id === 'bulk-export') {
      const data = await api.libraryBatch('export', [...selectedIds]);
      showExportDialog(data.data);
    } else if (e.target.id === 'bulk-move') {
      showMoveDialog([...selectedIds]);
    }
  });

  root.querySelector('#select-all').onchange = (e) => {
    papers.forEach(p => {
      if (e.target.checked) selectedIds.add(p.id);
      else selectedIds.delete(p.id);
    });
    loadList();
  };

  root.querySelector('#btn-import').onclick = showImportDialog;

  // ========== 分类操作 ==========
  async function createCategory() {
    const name = prompt('输入主题名称：');
    if (!name) return;
    try {
      await api.categoryCreate(name, 'literature');
      window.toast('已创建', 'success');
      await loadCategories();
    } catch (err) { window.toast(err.message, 'error'); }
  }
  async function editCategory(id) {
    const c = categories.find(x => x.id === id);
    const name = prompt('修改主题名称：', c?.name || '');
    if (!name || name === c?.name) return;
    await api.categoryUpdate(id, name);
    window.toast('已更新', 'success');
    await loadCategories();
  }
  async function delCategory(id) {
    if (!await window.confirmDialog('删除主题分类？该分类下的文献不会被删除，只是归为未分类')) return;
    await api.categoryDelete(id);
    window.toast('已删除', 'success');
    if (currentCategoryId === id) currentCategoryId = null;
    await loadCategories();
    await loadList();
  }

  // ========== 批量移动 ==========
  function showMoveDialog(ids) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>移动到主题分类</h3>
        <select id="move-cat" style="width:100%;margin-bottom:12px">
          <option value="">未分类</option>
          ${categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-close>取消</button>
          <button class="btn btn-primary" data-submit>确认移动</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-close]').onclick = () => overlay.remove();
    overlay.querySelector('[data-submit]').onclick = async () => {
      const catId = overlay.querySelector('#move-cat').value;
      await api.libraryBatch('move', ids, catId || null);
      window.toast('已移动', 'success');
      selectedIds.clear();
      overlay.remove();
      loadList();
    };
  }

  // ========== DOI 批量导入 ==========
  function showImportDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>DOI 批量导入</h3>
        <p style="font-size:12px">每行输入一个 DOI，系统会自动从 CrossRef 获取元数据和摘要</p>
        <div class="form-group">
          <label>DOI 列表（每行一个）</label>
          <textarea id="import-dois" rows="6" placeholder="10.1000/xyz&#10;10.1001/abc"></textarea>
        </div>
        <div class="form-group">
          <label>归入主题分类（可选）</label>
          <select id="import-cat" style="width:100%">
            <option value="">不归类</option>
            ${categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div id="import-progress" style="margin:8px 0;color:var(--text-secondary);font-size:13px"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-close>取消</button>
          <button class="btn btn-primary" data-submit>开始导入</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-close]').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('[data-submit]').onclick = async () => {
      const text = overlay.querySelector('#import-dois').value;
      const dois = text.split(/[\n,;]/).map(s => s.trim()).filter(Boolean);
      if (dois.length === 0) { window.toast('请输入 DOI', 'warning'); return; }
      const catId = overlay.querySelector('#import-cat').value;
      const progress = overlay.querySelector('#import-progress');
      progress.innerHTML = `正在导入 ${dois.length} 条 DOI，请稍候...`;

      overlay.querySelector('[data-submit]').disabled = true;
      try {
        const r = await api.libraryImportDoi(dois, catId || null);
        const okCount = r.results.filter(x => x.success).length;
        const failCount = r.results.length - okCount;
        progress.innerHTML = `完成！成功：${okCount}，失败：${failCount}`;
        window.toast(`导入完成，成功 ${okCount} 条`, failCount ? 'warning' : 'success');
        setTimeout(() => { overlay.remove(); loadList(); loadTags(); }, 1500);
      } catch (err) {
        progress.innerHTML = `导入失败：${err.message}`;
      } finally {
        overlay.querySelector('[data-submit]').disabled = false;
      }
    };
  }

  init();
}

function escapeHtml(s) { return String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]); }
