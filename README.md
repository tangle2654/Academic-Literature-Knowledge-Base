# Academic KB · 学术文献知识库

> 多用户全栈学术文献知识库 —— 文献检索、订阅推送、个人文献库、公众号收藏、暗黑模式，一站式个人学术知识沉淀平台。

## ✨ 功能概览

| 模块 | 核心功能 |
|------|---------|
| **账号系统** | 邮箱+密码注册登录、JWT 鉴权、独立数据空间、数据导出备份 |
| **文献检索** | CrossRef 代理检索、年份/作者/期刊/JCR 分区筛选、最新/相关度排序、自动中译摘要 |
| **订阅推送** | 每日/每周/每两周三档频率、JCR 分区过滤、手动触发、定时 cron、已读/新增标记 |
| **个人文献库** | 主题分类、标签系统、1-5 星评分、阅读笔记、批量操作、DOI 批量导入 |
| **引用导出** | GB/T 7714、APA 7、MLA 9 三种格式，一键复制 |
| **公众号收藏** | 自动抓取标题/摘要、分类管理、标签检索、批量操作 |
| **界面体验** | 暗黑模式、列表/网格视图切换、Toast 反馈、响应式布局 |

## 🏗️ 技术栈

- **后端**: Node.js + Express + SQLite (better-sqlite3) + JWT + node-cron + axios + cheerio
- **前端**: 原生 ES Modules + Vite 构建 + CSS 变量主题系统
- **数据持久化**: `data/app.db`（单文件数据库，首次启动自动初始化）

## 📁 目录结构

```
/workspace/
├── package.json              # 后端依赖 + install/build/start 标准脚本
├── backend/
│   ├── server.js             # Express 单入口，托管前端 + SPA 回退
│   ├── cron.js               # 订阅定时推送任务（每小时检查）
│   ├── utils/
│   │   ├── db.js             # SQLite 初始化 + 表结构 + 自动迁移
│   │   ├── auth.js           # JWT/bcrypt 工具 + 路由鉴权中间件
│   │   └── literature.js     # CrossRef 检索/翻译/DOI 查询代理
│   └── routes/
│       ├── auth.js           # 注册 / 登录 / me / 改密 / 数据导出
│       ├── literature.js     # 文献检索代理 + 翻译 + DOI + 开放获取 PDF
│       ├── library.js        # 文献收藏 CRUD + 批量操作 + DOI 导入
│       ├── subscriptions.js  # 订阅 CRUD + 手动推送 + 推送列表 + 已读
│       ├── categories.js    # 主题分类 CRUD + 标签管理
│       └── wechat.js         # 公众号链接 CRUD + 批量操作 + cheerio 抓取
├── frontend/
│   ├── package.json          # Vite 前端依赖
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.js           # SPA 路由 + 守卫 + 主题初始化
│       ├── api/index.js      # 前端 API 客户端（JWT 自动注入 + 401 重定向）
│       ├── store/index.js    # 全局状态 + localStorage 持久化
│       ├── reactive.js       # 极简响应式实现
│       ├── styles/main.css   # 浅/暗双主题 + 全部组件样式
│       ├── components/
│       │   ├── Layout.js     # 导航栏 + 路由占位
│       │   ├── PaperCard.js  # 文献卡片（收藏/引用/摘要展开）
│       │   ├── citation.js   # GB/T 7714 / APA / MLA 三格式弹窗
│       │   ├── toast.js      # 全局 Toast
│       │   └── confirm.js    # 确认对话框
│       └── views/
│           ├── LoginPage.js
│           ├── RegisterPage.js
│           ├── SearchPage.js
│           ├── SubscriptionPage.js
│           ├── LibraryPage.js
│           ├── WechatPage.js
│           └── ProfilePage.js
└── data/                     # SQLite 数据库文件（自动创建）
```

## 🚀 本地启动

```bash
# 1. 安装根依赖（后端 Express / SQLite / JWT 等）
npm install

# 2. 安装前端依赖（Vite）
#    方式一：手动
cd frontend && npm install
#    方式二：根目录 install 脚本已自动串联
npm run install

# 3. 构建前端产物（输出到 frontend/dist）
npm run build

# 4. 启动服务（默认 3000 端口）
npm start
# 或指定端口
PORT=8080 npm start
```

启动后访问 http://localhost:3000 ，即可看到登录页面。数据库文件会自动在 `data/app.db` 创建，首次访问不需要手动初始化。

### 开发模式

后端直接热重启（需 nodemon）：
```bash
npm run dev   # 同 npm start
```

前端 Vite dev server（5173 端口，已配置 API 代理到 3000）：
```bash
cd frontend && npm run dev
```

## 📦 API 速览

所有 `/api/*` 接口（除 `/api/auth/register` 和 `/api/auth/login`）需要在请求头携带 `Authorization: Bearer <token>`，否则返回 **401 未授权**。

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/auth/register` | 注册，返回 token + 用户信息 |
| POST | `/api/auth/login` | 登录，返回 token + 用户信息 |
| GET  | `/api/auth/me` | 当前用户信息 |
| PUT  | `/api/auth/me` | 修改昵称 / 密码 |
| GET  | `/api/auth/export` | 导出全部数据为 JSON 下载 |
| GET  | `/api/literature/search?q=...` | CrossRef 代理检索 |
| POST | `/api/literature/translate` | 摘要自动翻译 |
| GET  | `/api/library` | 我的文献库列表（支持 categoryId/q/tag/sortBy/minRating 参数） |
| POST | `/api/library` | 收藏一篇文献 |
| PUT  | `/api/library/:id` | 更新笔记/标签/评分/分类 |
| DELETE | `/api/library/:id` | 删除收藏 |
| POST | `/api/library/batch` | 批量 delete/move/export |
| POST | `/api/library/import-doi` | DOI 批量导入 |
| GET  | `/api/subscriptions` | 我的订阅列表 |
| POST | `/api/subscriptions` | 创建订阅（topic + frequency + jcr_filter） |
| PUT  | `/api/subscriptions/:id` | 编辑/暂停/恢复 |
| DELETE | `/api/subscriptions/:id` | 删除 |
| POST | `/api/subscriptions/:id/run` | 手动触发一次推送 |
| GET  | `/api/subscriptions/pushes` | 推送列表（支持 subscriptionId 过滤） |
| POST | `/api/subscriptions/pushes/read` | 标记已读（支持 all=true 一键全读） |
| GET/POST/PUT/DELETE | `/api/categories` | 主题分类 CRUD |
| GET/DELETE | `/api/categories/tags/...` | 标签管理 |
| GET  | `/api/wechat` | 公众号链接列表（支持 q/categoryId/tag 过滤） |
| POST | `/api/wechat` | 添加（自动 cheerio 抓取 title/摘要） |
| PUT/DELETE | `/api/wechat/:id` | 更新 / 删除 |
| POST | `/api/wechat/batch` | 批量 delete/move |

所有接口返回的 `library`、`wechat_links` 等列表都带 `user_id = ?` 的 WHERE 条件，**不同账号数据严格隔离**。

## 🌐 IGA Pages 一键部署

项目已按 IGA 部署规范适配：
- 端口读取 `process.env.PORT`（默认 3000）
- 所有文件路径使用相对路径
- 后端配置 SPA 回退（所有非 API 路径返回前端 `index.html`）
- `package.json` 包含 `engines: { node: ">=18.0.0" }`
- 三个标准脚本：`npm run install` / `npm run build` / `npm start`

### 部署步骤

#### 方式 A：CLI 手动部署（推荐）

```bash
# 1. 确保 CLI 版本 >= 1.1.0
npm i -g @iga-pages/cli@latest
iga --version

# 2. 登录（远程 headless 环境用 AK/SK，本地 IDE 用浏览器）
# 远程/CI 环境：
iga login --accessKey <YOUR_AK> --secretKey <YOUR_SK>
# 本地 IDE：
iga login

# 3. 检查登录状态
iga whoami

# 4. 在项目根目录执行部署（自动识别 Express + SPA 架构）
iga pages deploy --name academic-kb

# 首次部署后会创建项目并返回预览 URL，后续改动再部署直接 iga pages deploy 即可
```

#### 方式 B：GitHub 仓库 + Git 集成

```bash
cd /workspace
git init && git add . && git commit -m "init"
# 推送至 GitHub 后，iga pages deploy 自动识别为 Git 部署
iga pages deploy --name academic-kb
```

### 环境变量（可选）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 服务监听端口 |
| `JWT_SECRET` | `akb-default-secret-change-in-production-2026` | JWT 签名密钥（**生产环境务必覆盖**） |

### 部署后验证

部署完成后访问返回的 URL，流程：
1. 注册新账号（邮箱 + 密码 + 可选昵称）
2. 登录后进入文献检索 → 搜索关键词 → 收藏
3. 创建订阅任务 → 手动触发推送 → 查看推送列表
4. 在个人中心修改密码 / 导出数据 JSON 备份

## 🔒 安全注意事项

- **生产环境请覆盖 `JWT_SECRET`**（默认值仅用于开发）
- SQLite 数据库文件存放在 `data/` 目录，随服务持久化
- 所有 API 使用 **JWT Bearer Token** 鉴权，token 有效期 7 天
- 前端 token 存储在 `localStorage`，退出登录时自动清除
- 后端 CORS 中间件允许所有来源（`Access-Control-Allow-Origin: *`），生产可收紧

## 🧪 冒烟测试参考

后端内置了 26 个测试点覆盖：注册/登录/隔离/CRUD/订阅推送/DOI 导入/公众号/翻译/SPA 回退。全部通过才能认为 API 层正常。

## 📄 License

MIT
