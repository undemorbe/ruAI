/// <reference types="vitest/config" />
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv, runnerImport, type Plugin } from 'vite'

const SRC = fileURLToPath(new URL('./src', import.meta.url))

interface PrerenderModule {
  renderPath(shell: string, path: string): string
  prerenderAll(shell: string): { file: string; html: string }[]
}

/**
 * SEO-пререндер (src/seo/prerender.ts): в dev мета и статический текст подставляются в index.html
 * на каждый запрос, при сборке пишутся dist/<страница>/index.html для публичных страниц.
 */
function seoPrerender(): Plugin {
  let outDir = 'dist'
  let isBuild = false
  return {
    name: 'ruai-seo-prerender',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir)
      isBuild = c.command === 'build'
    },
    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        if (!ctx.server) return html // сборка: страницы пишет closeBundle
        const mod = (await ctx.server.ssrLoadModule('/src/seo/prerender.ts')) as PrerenderModule
        return mod.renderPath(html, new URL(ctx.originalUrl ?? '/', 'http://localhost').pathname)
      },
    },
    async closeBundle() {
      if (!isBuild) return
      const { module } = await runnerImport<PrerenderModule>(join(SRC, 'seo/prerender.ts'), {
        configFile: false,
        logLevel: 'error',
        resolve: { alias: { '@': SRC } },
      })
      const shell = readFileSync(join(outDir, 'index.html'), 'utf8')
      for (const { file, html } of module.prerenderAll(shell)) {
        mkdirSync(dirname(join(outDir, file)), { recursive: true })
        writeFileSync(join(outDir, file), html)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // GitHub Pages serves the app from /<repo>/ — CI passes VITE_BASE.
    base: env.VITE_BASE || '/',
    plugins: [vue(), seoPrerender()],
    resolve: {
      alias: { '@': SRC },
    },
    build: {
      // Covers Safari 14+, Chrome/Edge 90+, Firefox 90+, Yandex Browser.
      target: ['es2020', 'safari14', 'chrome90', 'firefox90', 'edge90'],
      cssTarget: ['safari14', 'chrome90', 'firefox90'],
      chunkSizeWarningLimit: 800,
    },
    server: {
      port: 5173,
      // npm run dev:api: фронт ходит в локальный ruai-api (server/, npm run dev:api) через /api
      proxy: env.VITE_API_URL === '/api' ? { '/api': { target: 'http://127.0.0.1:8080' } } : undefined,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.spec.ts'],
    },
  }
})
