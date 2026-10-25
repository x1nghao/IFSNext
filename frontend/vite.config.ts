import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'assets/*'],
      manifest: {
        name: 'IFSNext',
        short_name: 'IFSNext',
        description: 'IFS Activity Helper Platform',
        theme_color: '#32acb6',
        background_color: '#F2F2F7',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'assets/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'assets/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // 字体纳入预缓存，保证 PWA 离线时 Inter/JetBrains Mono 可用
        globPatterns: ['**/*.{js,css,html,woff2}'],
        runtimeCaching: [
          {
            // 弱网/离线兜底：/data 请求优先走网络（3 秒超时），失败时回退最近一次缓存
            urlPattern: ({ url }) => url.pathname === '/data',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ifs-data-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
