import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // 强制 skinview3d 与 R3F 共用同一份 three，消除"Multiple instances"警告
    dedupe: ['three'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/textures': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ysm': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
