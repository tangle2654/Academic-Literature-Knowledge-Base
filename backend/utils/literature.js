const axios = require('axios');

/**
 * 使用 CrossRef API 检索文献
 */
async function searchLiterature(query, opts = {}) {
  const { page = 1, perPage = 20, sort = 'relevance', filters = {} } = opts;

  const params = new URLSearchParams();
  params.append('query', query);
  params.append('rows', perPage);
  params.append('offset', (page - 1) * perPage);

  if (sort === 'latest') {
    params.append('sort', 'published');
    params.append('order', 'desc');
  }

  // 作者筛选
  if (filters.author) {
    params.append('query.author', filters.author);
  }
  // 期刊筛选
  if (filters.journal) {
    params.append('query.container-title', filters.journal);
  }
  // 年份筛选
  if (filters.year) {
    params.append('filter', `from-pub-date:${filters.year},until-pub-date:${filters.year}`);
  } else if (filters.yearFrom || filters.yearTo) {
    const parts = [];
    if (filters.yearFrom) parts.push(`from-pub-date:${filters.yearFrom}`);
    if (filters.yearTo) parts.push(`until-pub-date:${filters.yearTo}`);
    params.append('filter', parts.join(','));
  }

  try {
    const resp = await axios.get('https://api.crossref.org/works', {
      params,
      timeout: 15000,
      headers: { 'User-Agent': 'AcademicKB/1.0 (mailto:kb@example.com)' }
    });

    const items = resp.data.message.items || [];
    const total = resp.data.message['total-results'] || 0;

    const results = items.map(item => ({
      doi: item.DOI,
      title: (item.title && item.title[0]) || '无标题',
      authors: (item.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', '),
      journal: (item['container-title'] && item['container-title'][0]) || '',
      published_date: item['issued'] && item['issued']['date-parts']
        ? item['issued']['date-parts'][0].join('-')
        : '',
      abstract_en: stripTags(item.abstract || ''),
      jcr_quarter: guessJCR(item),
      pdf_url: findPdfUrl(item),
      source_url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ''),
      translated: null // 懒加载翻译
    }));

    return { total, page, perPage, results };
  } catch (err) {
    console.error('CrossRef API error:', err.message);
    // 返回空结果但不崩溃
    return { total: 0, page, perPage, results: [], error: err.message };
  }
}

function stripTags(text) {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function findPdfUrl(item) {
  // CrossRef 不直接提供 PDF 链接，尝试通过 media 字段获取
  if (item.link) {
    const pdfLink = item.link.find(l => l['content-type'] === 'application/pdf');
    if (pdfLink) return pdfLink.URL;
  }
  // 构造 Unpaywall 查找
  return '';
}

/**
 * 基于期刊信息粗略估算 JCR 分区（实际应用应查 Web of Science）
 */
function guessJCR(item) {
  // 简化处理：根据影响因子范围粗略推断，这里返回空让用户手动设置或忽略
  return '';
}

/**
 * 使用 Unpaywall API 获取开放获取 PDF
 */
async function getOpenAccessPdf(doi) {
  if (!doi) return null;
  try {
    const resp = await axios.get(`https://api.unpaywall.org/v2/${doi}`, {
      params: { email: 'kb@example.com' },
      timeout: 10000
    });
    const best = resp.data && resp.data.best_oa_location;
    return best && best.url_for_pdf ? best.url_for_pdf : (best && best.url_for_landing_page ? best.url_for_landing_page : null);
  } catch {
    return null;
  }
}

/**
 * 翻译文本（免费接口，失败则返回原文）
 */
async function translateText(text, source = 'en', target = 'zh') {
  if (!text || text.length < 2) return text;
  try {
    const resp = await axios.get('https://api.mymemory.translated.net/get', {
      params: { q: text, langpair: `${source}|${target}` },
      timeout: 10000
    });
    return (resp.data && resp.data.responseData && resp.data.responseData.translatedText) || text;
  } catch {
    return text;
  }
}

/**
 * 通过 DOI 获取文献详情
 */
async function getLiteratureByDoi(doi) {
  try {
    const resp = await axios.get(`https://api.crossref.org/works/${doi}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'AcademicKB/1.0 (mailto:kb@example.com)' }
    });
    const item = resp.data.message;
    return {
      doi: item.DOI,
      title: (item.title && item.title[0]) || '',
      authors: (item.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', '),
      journal: (item['container-title'] && item['container-title'][0]) || '',
      published_date: item['issued'] && item['issued']['date-parts']
        ? item['issued']['date-parts'][0].join('-')
        : '',
      abstract_en: stripTags(item.abstract || ''),
      jcr_quarter: guessJCR(item),
      source_url: item.URL || `https://doi.org/${item.DOI}`
    };
  } catch {
    return null;
  }
}

module.exports = {
  searchLiterature,
  translateText,
  getOpenAccessPdf,
  getLiteratureByDoi,
  stripTags
};
