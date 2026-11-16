/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { DEV_ADMIN_ORIGIN, DEV_ADMIN_PATH, DEV_ADMIN_PORT } from './server/src/devAdmin.ts'

/**
 * Отдельная сборка админки: ни строчки её кода нет в публичном бандле.
 * Прод-сборка — с относительным base ('./'): секретный путь не нужен при сборке и не попадает
 * в файлы, бандл кладётся в /var/www/ruai-admin/<ADMIN_PATH>/ на сервере. Результат — dist-admin/.
 */
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_ADMIN_BASE || (command === 'build' ? './' : '/')
  const dbDev = command === 'serve' && env.ADMIN_DEV_DB === '1'
  return {
    root: fileURLToPath(new URL('./admin', import.meta.url)),
    envDir: process.cwd(),
    base,
    plugins: [vue()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    build: {
      outDir: fileURLToPath(new URL('./dist-admin', import.meta.url)),
      emptyOutDir: true,
      target: ['es2020', 'safari14', 'chrome90', 'firefox90'],
      // без source map и без имён файлов, выдающих назначение
      sourcemap: false,
      assetsDir: 'a',
    },
    // ADMIN_DEV_DB=1 (npm run dev:admin:db): интерфейс ходит в локальный сервер админки на базе dev:api
    server: dbDev
      ? {
          port: Number(new URL(DEV_ADMIN_ORIGIN).port),
          strictPort: true,
          proxy: { '/api/': { target: `http://127.0.0.1:${DEV_ADMIN_PORT}`, rewrite: (p: string) => `/${DEV_ADMIN_PATH}${p}` } },
        }
      : { port: 5193, strictPort: true },
  }
})
