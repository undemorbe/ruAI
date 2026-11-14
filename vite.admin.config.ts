/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

/**
 * Отдельная сборка админки: ни строчки её кода нет в публичном бандле.
 * Прод-сборка — с относительным base ('./'): секретный путь не нужен при сборке и не попадает
 * в файлы, бандл кладётся в /var/www/ruai-admin/<ADMIN_PATH>/ на сервере. Результат — dist-admin/.
 */
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_ADMIN_BASE || (command === 'build' ? './' : '/')
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
    server: { port: 5193, strictPort: true },
  }
})
