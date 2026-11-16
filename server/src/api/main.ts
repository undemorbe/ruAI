/** Запуск: node --import ./src/register.ts src/api/main.ts (unit ruai-api.service). */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildApiApp } from './app.ts'
import { loadApiConfig } from './config.ts'
import { Db } from './db.ts'
import { ImageFiles } from './images.ts'
import { releaseStale } from './ledger.ts'
import { openRouter, stubLlm } from './openrouter.ts'
import { sweep } from './sweep.ts'
import { httpTgApi, type TgApi } from './tg/api.ts'
import { tgNotifier, type TgNotifier } from './tg/notify.ts'
import { runPolling } from './tg/poll.ts'

let cfg
try {
  cfg = loadApiConfig()
} catch (e) {
  process.stderr.write(`${(e as Error).message}\n`)
  process.exit(1)
}

try {
  mkdirSync(dirname(cfg.authLog), { recursive: true, mode: 0o750 })
} catch {
  /* каталог создаёт установка */
}
const authLog = (event: string, ip: string) => {
  const line = `${new Date().toISOString()} ${event} ip=${ip}\n`
  process.stderr.write(line)
  try {
    appendFileSync(cfg.authLog, line, { mode: 0o640 })
  } catch {
    /* нет прав в dev */
  }
}

const db = new Db(cfg.dbFile)
const files = new ImageFiles(cfg.imagesDir)
// бот входа: без токена или при недоступном Telegram сайт работает, вход по паролю без 2FA
let tg: TgNotifier | null = null
let tgApi: TgApi | null = null
if (cfg.tgToken) {
  const candidate = httpTgApi(cfg.tgToken)
  try {
    const me = await candidate.getMe()
    // getUpdates не работает при установленном webhook
    await candidate.deleteWebhook()
    tg = tgNotifier(candidate, me.username, cfg.origin)
    tgApi = candidate
  } catch (e) {
    process.stderr.write(`telegram off: ${(e as Error).message}\n`)
  }
}
const app = buildApiApp(cfg, { db, files, tg, tgApi, llm: cfg.llmStub ? stubLlm() : cfg.openrouterKey ? openRouter(cfg.openrouterKey, cfg.origin) : null, authLog })
const stopTg = new AbortController()
if (tgApi && app.tgBot) {
  const bot = app.tgBot
  void runPolling(db, tgApi, (u) => bot.handle(u), stopTg.signal)
}

const timer = setInterval(() => {
  try {
    releaseStale(db, Date.now())
    sweep(db, files, Date.now())
  } catch (e) {
    process.stderr.write(`sweep failed: ${(e as Error).message}\n`)
  }
}, 5 * 60_000)
timer.unref()

await app.listen({ host: cfg.host, port: cfg.port })
process.stderr.write(`ruai api: http://${cfg.host}:${cfg.port}/api/ (${tg ? `tg: @${tg.botName}` : 'tg: выключен'}${cfg.llmStub ? ', LLM: заглушка' : cfg.openrouterKey ? '' : ', LLM: выключена'})\n`)

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    stopTg.abort()
    app.close().finally(() => {
      db.close()
      process.exit(0)
    })
  })
}
