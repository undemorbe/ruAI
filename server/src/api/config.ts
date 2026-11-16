/**
 * Настройки публичного API из окружения (/etc/ruai-api.env, chmod 600, создаёт api-setup.ts).
 * Без обязательных значений сервер не стартует.
 */
import { IMAGE_MODEL_ID, MODELS } from '@/config/app'

export interface ApiConfig {
  host: string
  port: number
  /** Точный origin сайта для CSRF-проверки и ссылок из бота. */
  origin: string
  dbFile: string
  /** Каталог файлов картинок (вне webroot, отдаёт только API владельцу). */
  imagesDir: string
  /** Секрет для HMAC кодов 2FA: украденная база не раскрывает коды. */
  pepper: string
  /** Пусто: модель не подключена, отправка сообщений отвечает 503 model_off. */
  openrouterKey: string
  models: { text: string; media: string; image: string }
  /** Предохранитель: суммарный расход OpenRouter за сутки (МСК), $. */
  dailyUsdCap: number
  /** Токен бота входа (@BotFather). Пусто: бот выключен, Telegram-функции отвечают 503 tg_off. */
  tgToken: string
  /** Файл для fail2ban (строки API_AUTH_FAIL ip=…). */
  authLog: string
  /** http://localhost: cookie без __Host-/Secure. */
  insecureCookie: boolean
  /** Платёжный провайдер; пока none: оплата выключена (503). */
  payments: 'none'
  /** Локальная разработка без OpenRouter: ответы-заглушки (только localhost). */
  llmStub: boolean
}

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
export const TG_TOKEN = /^\d{6,12}:[\w-]{30,60}$/

export function loadApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const errors: string[] = []
  const need = (k: string) => {
    const v = env[k]?.trim()
    if (!v) errors.push(`${k} не задан`)
    return v ?? ''
  }

  const origin = need('API_ORIGIN').replace(/\/+$/, '')
  if (origin && !/^https:\/\/[^/]+$/.test(origin) && !LOCAL.test(origin)) errors.push('API_ORIGIN: https://домен без пути (http только для localhost)')
  const local = LOCAL.test(origin)

  const pepper = need('API_PEPPER')
  if (pepper && pepper.length < 32) errors.push('API_PEPPER короче 32 символов (сгенерируйте api-setup.ts)')
  // ключ необязателен: без него работают вход, чаты и аккаунт, а ответы модели выключены
  const openrouterKey = env.OPENROUTER_API_KEY?.trim() ?? ''
  if (openrouterKey && !/^[\w-]{20,200}$/.test(openrouterKey)) errors.push('OPENROUTER_API_KEY: неожиданный формат')

  // токен необязателен: без него вход по паролю работает, а привязка Telegram и 2FA выключены
  const tgToken = env.TG_BOT_TOKEN?.trim() ?? ''
  if (tgToken && !TG_TOKEN.test(tgToken)) errors.push('TG_BOT_TOKEN: неожиданный формат (123456:ABC… из @BotFather)')

  const host = env.HOST?.trim() || '127.0.0.1'
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) errors.push('HOST: API слушает только loopback, наружу его открывает nginx')

  const cap = Number(env.API_DAILY_USD_CAP ?? 30)
  if (!(cap > 0 && cap <= 10_000)) errors.push('API_DAILY_USD_CAP: число от 0 до 10000')

  if (errors.length) throw new Error(`Конфигурация API:\n- ${errors.join('\n- ')}`)

  const dataDir = env.API_DATA_DIR?.trim() || '/var/lib/ruai'
  return {
    host,
    port: Number(env.PORT) || 8080,
    origin,
    dbFile: env.API_DB?.trim() || `${dataDir}/ruai.db`,
    imagesDir: `${dataDir}/images`,
    pepper,
    openrouterKey,
    models: {
      text: env.MODEL_TEXT?.trim() || MODELS.text.id,
      media: env.MODEL_MEDIA?.trim() || MODELS.media.id,
      image: env.MODEL_IMAGE?.trim() || IMAGE_MODEL_ID,
    },
    dailyUsdCap: cap,
    tgToken,
    authLog: env.API_AUTH_LOG?.trim() || '/var/log/ruai-api/auth.log',
    insecureCookie: local,
    payments: 'none',
    llmStub: local && env.LLM_STUB === '1',
  }
}
