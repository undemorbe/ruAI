export const APP_NAME = 'ChatGPT'
export const SUPPORT_EMAIL = 'support@ruai.example'
export const TELEGRAM_URL = 'https://t.me/'

export interface ModelOption {
  id: string
  name: string
  hint: string
}

/** Единственная модель сервиса. Запросы идут через OpenRouter, ключ — только на сервере. */
export const MODEL: ModelOption = {
  id: 'openai/gpt-oss-20b',
  name: 'GPT-OSS-20B',
  hint: 'Текстовая модель: вопросы, тексты, код',
}

/**
 * Правила запроса. Сервер — источник истины; здесь копия для подсказок в интерфейсе
 * и для мока.
 */
export const LIMITS = {
  /** Максимум входных токенов на запрос (история + новое сообщение). */
  inputTokens: 16_000,
  /** Максимум выходных токенов на ответ. */
  outputTokens: 16_000,
  /** Сколько последних сообщений чата уходит в модель. */
  contextMessages: 20,
  perMinute: 5,
  perHour: 50,
  /** Одновременных запросов на пользователя. */
  concurrent: 1,
  /** Часовой пояс суточного сброса. */
  timezone: 'Europe/Moscow',
} as const

/** Слово, которым пользователь просит дописать обрезанный ответ. */
export const CONTINUE_PROMPT = 'Продолжи'
