import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 构建时间戳（本地时区）：打包时写死进产物，界面上能看到，
// 方便确认「我看到的到底是不是新版本」。
const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
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
        target: 'http://127.0.0.1:8770',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
