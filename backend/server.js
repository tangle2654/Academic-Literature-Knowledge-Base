const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('./utils/db'); // 触发数据库初始化
const { startCron } = require('./cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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

// 静态资源
const distPath = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(distPath));

// SPA 路由回退
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('API error:', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startCron();
});
