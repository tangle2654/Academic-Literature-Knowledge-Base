// 引用导出工具
function escapeHtml(str) { return String(str || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]); }

/**
 * GB/T 7714 引用格式（顺序编码制）
 */
function formatGBT7714(item, seq = 1) {
  const authors = (item.authors || '').split(',').map(s => s.trim()).filter(Boolean);
  let authStr = '';
  if (authors.length === 0) authStr = '佚名';
  else if (authors.length <= 3) authStr = authors.join(', ');
  else authStr = authors.slice(0, 3).join(', ') + ', et al';

  const title = item.title || '无标题';
  const journal = item.journal || '';
  const year = (item.published_date || '').slice(0, 4);
  const doi = item.doi ? `DOI: ${item.doi}` : '';
  return `[${seq}] ${authStr}. ${title}[J]. ${journal}, ${year}${doi ? ', ' + doi : ''}.`;
}

/**
 * APA 7 引用格式
 */
function formatAPA(item) {
  const authors = (item.authors || '').split(',').map(s => s.trim()).filter(Boolean);
  let authStr = '';
  if (authors.length === 0) authStr = 'Anonymous';
  else if (authors.length === 1) authStr = authors[0];
  else if (authors.length === 2) authStr = authors[0] + ', & ' + authors[1];
  else authStr = authors.slice(0, authors.length - 1).join(', ') + ', & ' + authors[authors.length - 1];

  const title = item.title || 'Untitled';
  const journal = item.journal || '';
  const year = (item.published_date || 'n.d.').slice(0, 4) || 'n.d.';
  const doi = item.doi ? `https://doi.org/${item.doi}` : (item.source_url || '');

  return `${authStr} (${year}). ${title}. ${journal}. ${doi}`;
}

/**
 * MLA 9 引用格式
 */
function formatMLA(item) {
  const authors = (item.authors || '').split(',').map(s => s.trim()).filter(Boolean);
  let authStr = '';
  if (authors.length === 0) authStr = 'Anonymous.';
  else if (authors.length === 1) authStr = authors[0] + '.';
  else if (authors.length === 2) authStr = authors[0] + ', and ' + authors[1] + '.';
  else authStr = authors[0] + ', et al.';

  const title = `"${item.title || 'Untitled'}."`;
  const journal = (item.journal || '').trim();
  const date = (item.published_date || '').slice(0, 4);
  const doi = item.doi ? `DOI: ${item.doi}` : '';

  return `${authStr} ${title} ${journal}${date ? ', ' + date : ''}. ${doi}`.trim();
}

export function exportReferences(items, format = 'apa') {
  const list = Array.isArray(items) ? items : [items];
  let lines = [];
  list.forEach((it, i) => {
    if (format === 'gbt7714') lines.push(formatGBT7714(it, i + 1));
    else if (format === 'mla') lines.push(formatMLA(it));
    else lines.push(formatAPA(it));
  });
  return lines.join('\n\n');
}

export function showExportDialog(items) {
  const formats = [
    { key: 'apa', label: 'APA 7' },
    { key: 'gbt7714', label: 'GB/T 7714' },
    { key: 'mla', label: 'MLA 9' }
  ];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box" style="min-width:520px">
      <h3>导出引用格式 ${Array.isArray(items) && items.length > 1 ? `(${items.length} 篇)` : ''}</h3>
      <div class="export-toolbar">
        ${formats.map(f => `<button class="btn btn-outline fmt-btn" data-fmt="${f.key}">${f.label}</button>`).join('')}
        <button class="btn btn-primary copy-btn">复制文本</button>
      </div>
      <textarea class="export-textarea" readonly></textarea>
      <div class="modal-actions">
        <button class="btn btn-secondary close-btn">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const ta = overlay.querySelector('.export-textarea');
  let currentFmt = 'apa';
  ta.value = exportReferences(items, currentFmt);

  overlay.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.onclick = () => {
      currentFmt = btn.dataset.fmt;
      ta.value = exportReferences(items, currentFmt);
      overlay.querySelectorAll('.fmt-btn').forEach(b => b.classList.toggle('primary', b === btn));
    };
  });
  overlay.querySelector('.fmt-btn[data-fmt="apa"]').classList.add('primary');

  overlay.querySelector('.copy-btn').onclick = async () => {
    try {
      await navigator.clipboard.writeText(ta.value);
      window.toast('引用已复制到剪贴板', 'success');
    } catch {
      ta.select(); document.execCommand('copy');
      window.toast('引用已复制', 'success');
    }
  };
  overlay.querySelector('.close-btn').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
