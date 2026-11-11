/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // GitHub Pages serves the app from /<repo>/ — CI passes VITE_BASE.
    base: env.VITE_BASE || '/',
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      // Covers Safari 14+, Chrome/Edge 90+, Firefox 90+, Yandex Browser.
      target: ['es2020', 'safari14', 'chrome90', 'firefox90', 'edge90'],
      cssTarget: ['safari14', 'chrome90', 'firefox90'],
      chunkSizeWarningLimit: 800,
    },
    server: { port: 5173 },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.spec.ts'],
    },
  }
})
