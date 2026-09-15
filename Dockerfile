# ===== 构建阶段：安装依赖 + 构建前端 =====
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# 原生模块编译需要的工具链
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# 先复制 package.json 利用 Docker 缓存
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package-lock.json ./frontend/
COPY backend/ ./backend/

# 安装所有依赖（better-sqlite3 预编译 binary + 后端 express 等）
RUN npm ci --no-audit --no-fund

# 构建前端 SPA
COPY frontend/ ./frontend/
RUN cd frontend && npm ci --no-audit --no-fund && npm run build

# ===== 运行阶段：仅拷贝必需产物 =====
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# 运行 better-sqlite3 需要 libsqlite3
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

# 只拷贝运行时需要的文件
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/frontend/dist ./frontend/dist

# 数据持久化目录（挂载 Volume 时用）
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["npm", "start"]
