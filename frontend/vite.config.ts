/**
 * Vite 构建配置。
 *
 * 职责：
 *     挂 Vue 插件、注入构建时间戳、配开发代理与产物目录。
 * 为什么需要：
 *     构建期常量（__BUILD_ID__）与 /api 代理都只能在这里配；页面代码不感知这些。
 * 上下游：
 *     上游：index.html、src/main.ts；下游：dist/ 静态产物与后台服务的 /api。
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 构建时间戳（本地时区）：打包时写死进产物，界面设置面板里能看到，
// 用来确认「我看到的到底是不是新版本」。
const now = new Date()
const pad = (n: number): string => String(n).padStart(2, '0')
const BUILD_ID = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
  `${pad(now.getHours())}:${pad(now.getMinutes())}`

export default defineConfig({
  plugins: [vue()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID)
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8888',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
