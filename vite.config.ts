// 本项目编码格式：UTF-8（无 BOM）。
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// why：dev 走 Vite 代理把 /api 与 /docs 转发到后端。后端 CORS 白名单默认为空（不发 CORS 头），
// 同源代理规避跨域。报告不再走 /static（后端已摘除无鉴权静态面），
// 改为带 Authorization 取 /api/v1/tasks/{id}/report 后本地 blob 打开。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/docs': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // why：Element Plus 全量引入体积大，拆独立 chunk 走浏览器并行加载（MVP 不配按需插件）
        manualChunks: {
          'element-plus': ['element-plus', '@element-plus/icons-vue'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
