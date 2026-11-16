#!/usr/bin/env node
// Сообщает Яндексу (IndexNow) адреса из sitemap после выкладки, чтобы изменения попали в поиск быстрее.
// Запускает deploy/deploy.sh; вручную: node scripts/indexnow.mjs
// Ключ и адреса - из src/seo (site.ts, files.ts). Ошибка здесь выкладку не ломает.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runnerImport } from 'vite'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const { module } = await runnerImport(join(SRC, 'seo/files.ts'), {
  configFile: false,
  logLevel: 'error',
  resolve: { alias: { '@': SRC } },
})
const payload = module.indexNowPayload()

// Без файла ключа на сайте Яндекс запрос отклонит: проверяем, что выкладка его уже отдаёт.
const keyFile = await fetch(payload.keyLocation, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
const keyText = keyFile.ok ? (await keyFile.text()).trim() : ''
if (keyText !== payload.key) {
  console.warn(`IndexNow: ${payload.keyLocation} не отдаёт ключ (HTTP ${keyFile.status}), пропускаю`)
  process.exit(0)
}

const res = await fetch('https://yandex.com/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(15_000),
})
console.log(`IndexNow: ${payload.urlList.length} адресов, ответ Яндекса HTTP ${res.status}`)
if (!res.ok) console.warn((await res.text()).slice(0, 300))
