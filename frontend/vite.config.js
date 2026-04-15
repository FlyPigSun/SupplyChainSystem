import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/SupplyChainSystem/',
  server: {
    port: 8081,
    host: '0.0.0.0',
    proxy: {
      '/SupplyChainSystem/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/SupplyChainSystem/, '')
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
