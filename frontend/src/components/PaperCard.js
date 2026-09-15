import { api } from '../api/index.js';

/**
 * 渲染一个文献卡片到 container
 * item: 文献对象
 * opts: { showSave, showAbstract, compact, onAction }
 */
export function renderPaperCard(container, item, opts = {}) {
  const {
    showSave = true,
    showAbstract = true,
    compact = false,
    showNew = false,
    showCheckBox = false,
    selected = false,
    onToggleSelect,
    onSaved
  } = opts;

  const authorsHtml = item.authors ? `<span>👤 ${item.authors}</span>` : '';
  const journalHtml = item.journal ? `<span>📰 ${item.journal}</span>` : '';
  const dateHtml = item.published_date ? `<span>📅 ${item.published_date}</span>` : '';
  const jcrHtml = item.jcr_quarter ? `<span>🏆 ${item.jcr_quarter}</span>` : '';

  const tagHtml = Array.isArray(item.tags) && item.tags.length > 0
    ? `<div class="paper-tags">${item.tags.map(t => `<span class="paper-tag">${t}</span>`).join('')}</div>`
    : '';

  const ratingHtml = `
    <span class="paper-rating" data-id="${item.id || item.doi || ''}">
      ${[1,2,3,4,5].map(n => `<span class="star ${n <= (item.rating || 0) ? '' : 'empty'}">★</span>`).join('')}
    </span>
  `;

  const abstractHtml = showAbstract && item.abstract_en
    ? `<div class="paper-abstract" data-full="${escapeHtml(item.abstract_en)}">${escapeHtml(truncate(item.abstract_en, 280))}${item.abstract_en.length > 280 ? '<span class="toggle-abstract" style="color:var(--primary);cursor:pointer;margin-left:4px">展开</span>' : ''}</div>`
    : '';

  const tagsAddon = (item.abstract_zh && item.abstract_zh !== item.abstract_en)
    ? `<div class="paper-abstract" style="margin-top:8px;color:var(--text-secondary)" data-full="${escapeHtml(item.abstract_zh)}"><b>中译：</b>${escapeHtml(truncate(item.abstract_zh, 280))}</div>` : '';

  const urlHtml = item.source_url ? `<button class="btn btn-outline btn-sm" data-action="source">🔗 原文</button>` : '';
  const pdfHtml = item.pdf_url ? `<a href="${item.pdf_url}" target="_blank" class="btn btn-primary btn-sm">📥 下载 PDF</a>` : '';
  const saveHtml = showSave ? `<button class="btn btn-primary btn-sm" data-action="save">⭐ 收藏</button>` : '';
  const citeHtml = `<button class="btn btn-outline btn-sm" data-action="cite">📝 引用</button>`;

  const checkHtml = showCheckBox
    ? `<input type="checkbox" class="paper-check" ${selected ? 'checked' : ''} data-id="${item.id || ''}" style="margin-right:8px"/>`
    : '';

  const newBadgeHtml = showNew
    ? `<span class="new-badge">NEW</span>`
    : '';

  const rating = compact ? '' : ratingHtml;

  const div = document.createElement('div');
  div.className = 'paper-card';
  div.innerHTML = `
    ${newBadgeHtml}
    <div style="display:flex;align-items:flex-start;gap:8px;">
      ${checkHtml}
      <div style="flex:1;min-width:0">
        <h3 class="paper-title">${escapeHtml(item.title || '无标题')}</h3>
        <div class="paper-meta">${authorsHtml}${journalHtml}${dateHtml}${jcrHtml}</div>
        ${tagHtml}
        ${rating}
        ${abstractHtml}
        ${tagsAddon}
        <div class="paper-actions">
          ${saveHtml}
          ${pdfHtml}
          ${urlHtml}
          ${citeHtml}
        </div>
      </div>
    </div>
  `;

  // 绑定展开/收起摘要
  div.querySelectorAll('.toggle-abstract').forEach(btn => {
    btn.onclick = () => {
      const p = btn.closest('.paper-abstract');
      const full = p.dataset.full || '';
      if (p.classList.contains('expanded')) {
        p.textContent = truncate(full, 280);
        p.classList.remove('expanded');
        btn.textContent = '展开';
      } else {
        p.innerHTML = escapeHtml(full) + '<span class="toggle-abstract" style="color:var(--primary);cursor:pointer;margin-left:4px">收起</span>';
        p.classList.add('expanded');
      }
    };
  });

  // 绑定操作按钮
  div.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async () => {
      const action = btn.dataset.action;
      if (action === 'source' && item.source_url) {
        window.open(item.source_url, '_blank');
      } else if (action === 'save') {
        await handleSave(item, btn, onSaved);
      } else if (action === 'cite') {
        const { showExportDialog } = await import('../components/citation.js');
        showExportDialog(item);
      }
    };
  });

  // Checkbox
  const ck = div.querySelector('.paper-check');
  if (ck && onToggleSelect) {
    ck.onchange = () => onToggleSelect(item, ck.checked);
  }

  container.appendChild(div);
}

async function handleSave(item, btn, onSaved) {
  btn.disabled = true; btn.textContent = '保存中...';
  try {
    await api.libraryAdd({
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
    });
    window.toast('已收藏到个人文献库', 'success');
    btn.textContent = '已收藏 ✓';
    btn.disabled = true;
    if (onSaved) onSaved(item);
  } catch (err) {
    window.toast(err.message, 'error');
    btn.disabled = false; btn.textContent = '⭐ 收藏';
  }
}

function truncate(s, n) { return s.length > n ? s.slice(0, n) + '...' : s; }
function escapeHtml(s) { return String(s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]); }
