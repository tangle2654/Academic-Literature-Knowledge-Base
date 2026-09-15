const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('./utils/db'); // 触发数据库初始化
const { startCron } = require('./cron');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS：生产环境可通过 CORS_ORIGINS 配置允许的来源（逗号分隔）
// 不设置则开放全部（开发友好；生产建议收紧）
const corsOrigins = process.env.CORS_ORIGINS;
const corsOptions = corsOrigins
  ? { origin: corsOrigins.split(',').map(s => s.trim()), credentials: true }
  : undefined;
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/literature', require('./routes/literature'));
app.use('/api/library', require('./routes/library'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/wechat', require('./routes/wechat'));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// 静态资源 + SPA 回退（仅在前端已构建时启用）
const distPath = path.resolve(__dirname, '../frontend/dist');
const distExists = require('fs').existsSync(distPath);
if (distExists) {
  app.use(express.static(distPath));
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log('[static] serving frontend from', distPath);
} else {
  console.warn('[static] frontend/dist not found — SPA disabled, API-only mode');
  app.get('/', (req, res) => res.json({ ok: true, service: 'academic-kb-api', hint: 'frontend not built' }));
}

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('API error:', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startCron();
});
