import { api } from '../api/index.js';
import { renderPaperCard } from '../components/PaperCard.js';

export function SearchPage(root) {
  let page = 1;
  let total = 0;
  let results = [];
  let searching = false;

  root.innerHTML = `
    <div class="page-header">
      <div>
        <h2>文献检索 🔍</h2>
        <div class="page-desc">检索期刊文献，支持筛选、排序、翻译、一键收藏</div>
      </div>
    </div>

    <form id="search-form">
      <div class="search-bar">
        <input type="text" id="q" name="q" placeholder="输入关键词 / 主题 / 作者，例如：transformer in NLP" required />
        <button type="submit" class="btn btn-primary">搜索</button>
      </div>
      <div class="filters">
        <input type="number" id="yearFrom" placeholder="起始年份" min="1900" max="2100" />
        <input type="number" id="yearTo" placeholder="结束年份" min="1900" max="2100" />
        <input type="text" id="author" placeholder="作者姓名" />
        <input type="text" id="journal" placeholder="期刊名称" />
        <select id="jcr">
          <option value="all">JCR 分区（不限）</option>
          <option value="Q1">Q1</option>
          <option value="Q2">Q2</option>
          <option value="Q3">Q3</option>
          <option value="Q4">Q4</option>
        </select>
        <select id="sort">
          <option value="relevance">相关度排序</option>
          <option value="latest">最新发表</option>
        </select>
      </div>
    </form>

    <div id="results-summary"></div>
    <div id="results" class="paper-list"></div>
    <div id="pagination" class="pagination"></div>
  `;

  const form = root.querySelector('#search-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    page = 1;
    await doSearch();
  });

  async function doSearch() {
    if (searching) return;
    searching = true;

    const q = root.querySelector('#q').value.trim();
    if (!q) { window.toast('请输入关键词', 'warning'); searching = false; return; }

    const summary = root.querySelector('#results-summary');
    const list = root.querySelector('#results');
    const pag = root.querySelector('#pagination');
    summary.innerHTML = `<div class="loading">正在检索中</div>`;
    list.innerHTML = '';
    pag.innerHTML = '';

    const params = {
      q,
      page,
      perPage: 20,
      sort: root.querySelector('#sort').value,
      jcr: root.querySelector('#jcr').value,
      author: root.querySelector('#author').value.trim(),
      journal: root.querySelector('#journal').value.trim()
    };
    const yf = root.querySelector('#yearFrom').value;
    const yt = root.querySelector('#yearTo').value;
    if (yf) params.yearFrom = yf;
    if (yt) params.yearTo = yt;

    try {
      const data = await api.searchLiterature(params);
      results = data.results || [];
      total = data.total || 0;

      summary.innerHTML = `<div style="color:var(--text-secondary);font-size:13px;margin-bottom:12px">找到 ${total} 条结果，当前第 ${page} 页</div>`;

      if (results.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div>未找到相关文献，换个关键词试试</div>`;
      } else {
        for (const item of results) {
          // 异步翻译摘要
          renderPaperCard(list, item, { showAbstract: true });
          if (item.abstract_en) {
            translateAndShow(item);
          }
        }
        renderPagination();
      }
    } catch (err) {
      summary.innerHTML = `<div style="color:var(--danger)">搜索失败：${err.message}</div>`;
    } finally {
      searching = false;
    }
  }

  async function translateAndShow(item) {
    try {
      const { translated } = await api.translate(item.abstract_en);
      item.abstract_zh = translated;
      // 找到对应的卡片中译区域
      const cards = root.querySelectorAll('.paper-card');
      const last = cards[cards.length - 1];
      if (last && !last.querySelector('.zh-translated')) {
        const zhDiv = document.createElement('div');
        zhDiv.className = 'zh-translated paper-abstract';
        zhDiv.style.marginTop = '6px';
        zhDiv.innerHTML = `<b style="color:var(--primary)">📖 中文摘要：</b>${escapeHtml(truncate(translated, 260))}${translated.length > 260 ? '<span class="toggle" style="color:var(--primary);cursor:pointer;margin-left:4px">展开</span>' : ''}`;
        last.querySelector('.paper-meta')?.after(zhDiv);
        zhDiv.querySelector('.toggle')?.addEventListener('click', () => {
          zhDiv.innerHTML = `<b style="color:var(--primary)">📖 中文摘要：</b>${escapeHtml(translated)}`;
        });
      }
    } catch { /* 翻译失败不影响展示 */ }
  }

  function renderPagination() {
    const pag = root.querySelector('#pagination');
    const totalPages = Math.min(50, Math.ceil(total / 20));
    if (totalPages <= 1) { pag.innerHTML = ''; return; }
    let html = `<button class="btn btn-sm" ${page === 1 ? 'disabled' : ''} data-go="${page - 1}">上一页</button>`;
    for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
      html += `<button class="btn btn-sm ${i === page ? 'btn-primary' : ''}" data-go="${i}">${i}</button>`;
    }
    html += `<button class="btn btn-sm" ${page === totalPages ? 'disabled' : ''} data-go="${page + 1}">下一页</button>`;
    pag.innerHTML = html;
    pag.querySelectorAll('[data-go]').forEach(btn => {
      btn.onclick = () => { page = Number(btn.dataset.go); doSearch(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    });
  }

  function truncate(s, n) { return s.length > n ? s.slice(0, n) + '...' : s; }
  function escapeHtml(s) { return String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]); }
}
