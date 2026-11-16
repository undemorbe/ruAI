/**
 * Настройки бота поддержки из окружения (systemd EnvironmentFile, chmod 600).
 * Значения секретов никогда не попадают в тексты ошибок: только имя переменной и что с ней не так.
 */

export interface Config {
  token: string
  supportChatId: number
  /** База Bot API: https://api.telegram.org или свой Bot API-сервер на localhost. */
  apiBase: string
  dataDir: string
  rateLimitPerMinute: number
  maxTextLength: number
  newTopicsPerHour: number
}

const TOKEN_RE = /^\d{5,20}:[A-Za-z0-9_-]{30,64}$/
const CHAT_RE = /^-100\d{5,16}$/

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const errors: string[] = []

  const token = env.BOT_TOKEN?.trim() ?? ''
  if (!token) errors.push('BOT_TOKEN не задан')
  else if (!TOKEN_RE.test(token)) errors.push('BOT_TOKEN: неверный формат (ожидается 123456789:AA…, выдаёт @BotFather)')

  const chatRaw = env.SUPPORT_CHAT_ID?.trim() ?? ''
  if (!chatRaw) errors.push('SUPPORT_CHAT_ID не задан')
  else if (!CHAT_RE.test(chatRaw)) errors.push('SUPPORT_CHAT_ID: ожидается id супергруппы вида -100…')
  const supportChatId = Number(chatRaw)

  const apiBase = (env.TELEGRAM_API_BASE?.trim() || 'https://api.telegram.org').replace(/\/+$/, '')
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(apiBase) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(apiBase)) {
    errors.push('TELEGRAM_API_BASE: https://хост без пути (http — только localhost)')
  }

  const int = (key: string, def: number, min: number, max: number) => {
    const raw = env[key]?.trim()
    if (!raw) return def
    const n = Number(raw)
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`${key}: целое число от ${min} до ${max}`)
      return def
    }
    return n
  }
  const rateLimitPerMinute = int('RATE_LIMIT_PER_MINUTE', 20, 1, 600)
  const maxTextLength = int('MAX_TEXT_LENGTH', 3000, 1, 4096)
  const newTopicsPerHour = int('NEW_TOPICS_PER_HOUR', 60, 1, 10_000)

  if (errors.length) throw new Error(`Конфигурация бота поддержки:\n- ${errors.join('\n- ')}`)

  return {
    token,
    supportChatId,
    apiBase,
    dataDir: env.DATA_DIR?.trim() || '/var/lib/ruai-support-bot',
    rateLimitPerMinute,
    maxTextLength,
    newTopicsPerHour,
  }
}
