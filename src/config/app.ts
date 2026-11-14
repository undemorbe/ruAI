export const APP_NAME = 'ChatGPT'
export const SUPPORT_EMAIL = 'support@ruai.example'
export const TELEGRAM_URL = 'https://t.me/'

export interface ModelOption {
  id: string
  name: string
  hint: string
}

/**
 * Модели по тарифам. Запросы идут через OpenRouter, ключ — только на сервере;
 * модель выбирает сервер по тарифу подписки.
 * `name` — то, что видит пользователь. У текстового тарифа модель не называем.
 */
export const MODELS = {
  text: { id: 'openai/gpt-oss-20b', name: 'ChatGPT', hint: 'Тексты, учёба, код' },
  // Точный id GPT-5.6 Luna и модель генерации сверить с каталогом OpenRouter тестовым запросом.
  media: { id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna', hint: 'Тексты, анализ фото и картинки' },
} satisfies Record<'text' | 'media', ModelOption>
export const IMAGE_MODEL_ID = 'openai/gpt-5.6-luna-image'

/** Загрузка фото: форматы и размер (проверяет и сервер). */
export const UPLOAD = { maxBytes: 10 * 1024 * 1024, maxFiles: 4, accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif' }

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
