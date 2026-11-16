/** Чистые функции настройки API сайта (scripts/api-setup.ts, покрыты тестами). */
import { randomBytes } from 'node:crypto'
import { TG_TOKEN } from './config.ts'

export interface ApiEnvValues {
  origin: string
  pepper: string
  /** Пусто: модель пока не подключена. */
  openrouterKey: string
  /** Пусто: бот входа не подключён (вход по паролю без 2FA). */
  tgToken: string
  dailyUsdCap: number
}

export const newPepper = () => randomBytes(32).toString('base64url')

export function validateApiEnv(v: ApiEnvValues): string[] {
  const e: string[] = []
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(v.origin)) e.push('Адрес сайта: https://домен без пути')
  if (v.pepper.length < 32) e.push('pepper короче 32 символов')
  if (v.openrouterKey && !/^[\w-]{20,200}$/.test(v.openrouterKey)) e.push('Ключ OpenRouter: ожидается sk-or-…')
  if (v.tgToken && !TG_TOKEN.test(v.tgToken)) e.push('Токен бота: 123456:ABC… из @BotFather')
  if (!(v.dailyUsdCap > 0 && v.dailyUsdCap <= 10_000)) e.push('Суточный лимит расходов: от 0 до 10000 $')
  return e
}

/** Содержимое /etc/ruai-api.env (chmod 600, root). Значения в одинарных кавычках. */
export function renderApiEnv(v: ApiEnvValues): string {
  return [
    '# ruAI API: секреты. chmod 600, владелец root. Создано scripts/api-setup.ts',
    `API_ORIGIN=${v.origin}`,
    `API_PEPPER=${v.pepper}`,
    v.openrouterKey ? `OPENROUTER_API_KEY=${v.openrouterKey}` : '# OPENROUTER_API_KEY= (не задан: ответы модели выключены)',
    v.tgToken ? `TG_BOT_TOKEN=${v.tgToken}` : '# TG_BOT_TOKEN= (не задан: вход без Telegram-2FA)',
    `API_DAILY_USD_CAP=${v.dailyUsdCap}`,
    'API_DATA_DIR=/var/lib/ruai',
    'API_AUTH_LOG=/var/log/ruai-api/auth.log',
    '# Модели (по умолчанию из src/config/app.ts):',
    '# MODEL_TEXT=openai/gpt-oss-20b',
    '# MODEL_MEDIA=',
    '# MODEL_IMAGE=',
    '',
  ].join('\n')
}

/** Достаёт значение из существующего env-файла (чтобы не менять pepper при перенастройке). */
export function envValue(text: string, key: string): string | null {
  const m = new RegExp(`^${key}=(.*)$`, 'm').exec(text)
  return m ? m[1]!.replace(/^'(.*)'$/, '$1') : null
}
