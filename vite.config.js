import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon-192.png'],
      manifest: {
        id: '/',
        name: 'Kyle & Sandy 婚禮邀請',
        short_name: 'K&S 婚禮',
        description: 'Kyle & Sandy 誠摯邀請您出席我們的婚禮 — 2026/08/01 台北萬豪酒店',
        lang: 'zh-Hant',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4efe5',
        theme_color: '#f4efe5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // /api 一律走網路，不快取；其餘導覽（含 /admin）離線回退到 index.html
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // 開發時不啟用 SW，避免和 HMR 互相干擾；用正式 build 驗證
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
    proxy: {
      // 開發時把 /api 轉給後端 (server/index.js)
      '/api': `http://localhost:${process.env.API_PORT || 8787}`,
    },
  },
  preview: {
    host: true,
    port: Number(process.env.PORT) || 4173,
  },
})
