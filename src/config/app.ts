export const APP_NAME = 'ChatGPT'
export const TELEGRAM_URL = 'https://t.me/'

export interface ModelOption {
  id: string
  name: string
  hint: string
}

/**
 * Модели. Запросы идут через OpenRouter, ключ только на сервере; модель выбирает сервер по тарифу подписки:
 *   - текстовый тариф: `MODELS.text` (GPT-OSS-20B), только текстовые сообщения;
 *   - расширенный тариф: `MODELS.media` (GPT-5.6 Luna) на все сообщения, включая анализ фото;
 *   - картинки: `IMAGE_MODEL_ID` (GPT Image 2.6 Flare) через серверный инструмент OpenRouter
 *     `openrouter:image_generation`: Luna сама решает по просьбе пользователя, что и когда рисовать.
 * `name` - то, что видит пользователь (чат, тарифы, оформление); главная страница пишет просто «ChatGPT».
 */
export const MODEL_NAME = 'ChatGPT-6.1 Astra'

// id сверены с каталогом OpenRouter (GET /api/v1/models) 16.11.2026.
export const MODELS = {
  text: { id: 'openai/gpt-oss-20b', name: MODEL_NAME, hint: 'Тексты, учёба, код' },
  media: { id: 'openai/gpt-5.6-luna', name: MODEL_NAME, hint: 'Тексты, анализ фото и картинки' },
} satisfies Record<'text' | 'media', ModelOption>
/** Создание и редактирование картинок (инструмент `openrouter:image_generation`; фактическую цену присылает OpenRouter). */
export const IMAGE_MODEL_ID = 'openai/gpt-image-2.6-flare'

/** Загрузка фото: форматы и размер (проверяет и сервер). */
export const UPLOAD = { maxBytes: 10 * 1024 * 1024, maxFiles: 4, accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif' }

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
