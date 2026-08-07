import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// 仅构建「网页版 / 自托管服务」前端：不带 Electron 主进程与预加载脚本，
// 并把 window.__TIANJIAN_SERVER__ 场景通过 import.meta.env.VITE_SERVER_MODE 注入，
// 让前端 webBackend 走「同活后端代理」模式（账号、WebDAV 流、封面、歌词都经后端）。
export default defineConfig({
  plugins: [react()],
  define: {
    // 仅 build:server 时为真，让前端 webBackend 走「同活后端代理」模式
    'import.meta.env.VITE_SERVER_MODE': 'true'
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    port: 5173
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  }
})
