/**
 * Точка входа: node src/main.ts (Node 24 запускает TypeScript сам).
 * Окружение: BOT_TOKEN, SUPPORT_CHAT_ID и необязательные параметры — см. .env.example.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SupportBot } from './bot.ts'
import { checkSupportChat, registerCommands } from './checks.ts'
import { loadConfig } from './config.ts'
import { createLogger } from './log.ts'
import { pollUpdates } from './poller.ts'
import { SendQueue } from './queue.ts'
import { SupportStore } from './store.ts'
import { type TgUser, createApi, errText } from './telegram.ts'

const DAY = 86_400_000
/** Соответствия сообщений (для «ответа на») храним полгода. */
const MESSAGE_MAP_TTL = 180 * DAY

async function main(): Promise<void> {
  process.umask(0o077) // база и её WAL-файлы — только для пользователя бота
  const cfg = loadConfig()
  const log = createLogger([cfg.token])
  const api = createApi(cfg.token, cfg.apiBase)

  const me = await api.call<TgUser>('getMe')
  if (!me.username) throw new Error('getMe не вернул username бота')
  // если когда-то был выставлен webhook, getUpdates отвечал бы 409
  await api.call('deleteWebhook', { drop_pending_updates: false })
  for (const p of await checkSupportChat(api, cfg.supportChatId, me.id)) log('setup_warning', { problem: p })
  await registerCommands(api, cfg.supportChatId).catch((e: unknown) => log('setup_warning', { problem: `setMyCommands: ${errText(e)}` }))

  mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 })
  const store = new SupportStore(join(cfg.dataDir, 'support.db'))
  const pruned = store.prune(Date.now() - MESSAGE_MAP_TTL)
  const pruneTimer = setInterval(() => store.prune(Date.now() - MESSAGE_MAP_TTL), DAY)
  pruneTimer.unref()

  const queue = new SendQueue(api, { log })
  const bot = new SupportBot({
    tg: queue,
    store,
    log,
    config: {
      supportChatId: cfg.supportChatId,
      rateLimitPerMinute: cfg.rateLimitPerMinute,
      maxTextLength: cfg.maxTextLength,
      newTopicsPerHour: cfg.newTopicsPerHour,
      albumDelayMs: 1000,
    },
  })
  bot.setBotUsername(me.username)

  const ac = new AbortController()
  for (const sig of ['SIGTERM', 'SIGINT'] as const) process.once(sig, () => ac.abort())

  log('started', { bot: me.username, pruned })
  try {
    await pollUpdates(api, (u) => bot.handleUpdate(u), { signal: ac.signal, log })
  } finally {
    await bot.drain()
    await queue.idle()
    clearInterval(pruneTimer)
    store.close()
    log('stopped')
  }
}

main().catch((e: unknown) => {
  // config и telegram секретов в ошибки не кладут; токен вырезаем ещё раз на всякий случай
  const token = process.env.BOT_TOKEN?.trim()
  const text = errText(e)
  console.error(`Бот поддержки остановлен: ${token && token.length >= 8 ? text.split(token).join('***') : text}`)
  process.exit(1)
})
