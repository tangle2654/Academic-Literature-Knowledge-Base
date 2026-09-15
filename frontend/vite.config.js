import { defineConfig } from 'vite';

// GitHub Pages 部署到子路径时需要 base = '/仓库名/'
// 本地 / Netlify / 根域名 部署用默认 '/'
const base = process.env.VITE_BASE || '/';

export default defineConfig({
  base,
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
