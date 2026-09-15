/**
 * 订阅定时推送 - node-cron
 * 扫描所有活跃订阅，根据频率判断是否需要执行，执行后推送文献列表
 */
const cron = require('node-cron');
const db = require('./utils/db');
const litService = require('./utils/literature');

function nextRunByFrequency(lastRun, frequency) {
  const base = lastRun ? new Date(lastRun) : new Date(0);
  const next = new Date(base);
  switch (frequency) {
    case 'daily': next.setDate(next.getDate() + 1); break;
    case 'weekly': next.setDate(next.getDate() + 7); break;
    case 'biweekly': next.setDate(next.getDate() + 14); break;
    default: next.setDate(next.getDate() + 7);
  }
  return next;
}

async function runAllSubscriptions() {
  const now = new Date();
  const subs = db.prepare('SELECT * FROM subscriptions WHERE is_active = 1').all();

  for (const sub of subs) {
    const last = sub.last_run ? new Date(sub.last_run) : null;
    const nextRun = nextRunByFrequency(last, sub.frequency);
    if (last && nextRun > now) continue; // 还没到时间

    try {
      const result = await litService.searchLiterature(sub.topic, { page: 1, perPage: 10, sort: 'latest' });
      let added = 0;
      for (const item of result.results || []) {
        if (sub.jcr_filter && sub.jcr_filter !== 'all' && item.jcr_quarter && item.jcr_quarter !== sub.jcr_filter) continue;
        const exist = db.prepare('SELECT id FROM subscription_push WHERE subscription_id = ? AND (doi = ? OR title = ?)')
          .get(sub.id, item.doi, item.title);
        if (exist) continue;

        db.prepare(`INSERT INTO subscription_push
          (subscription_id, title, authors, journal, published_date, jcr_quarter, abstract_en, abstract_zh, pdf_url, source_url, is_new)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(sub.id, item.title, item.authors, item.journal, item.published_date, item.jcr_quarter,
          item.abstract_en, item.abstract_zh, item.pdf_url, item.source_url);
        added++;
      }
      db.prepare('UPDATE subscriptions SET last_run = datetime(\'now\') WHERE id = ?').run(sub.id);
      console.log(`[cron] subscription #${sub.id} (${sub.topic}) pushed ${added} new items`);
    } catch (err) {
      console.error(`[cron] subscription #${sub.id} error:`, err.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

function startCron() {
  // 每小时检查一次
  cron.schedule('0 * * * *', () => {
    runAllSubscriptions().catch(err => console.error('cron error:', err));
  });
  console.log('[cron] subscription cron job started (runs every hour)');
}

module.exports = { runAllSubscriptions, startCron };
