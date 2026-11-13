export const APP_NAME = 'ChatGPT'
export const SUPPORT_EMAIL = 'support@ruai.example'
export const TELEGRAM_URL = 'https://t.me/'

export interface ModelOption {
  id: string
  name: string
  hint: string
  requiresPlan: boolean
}

export const MODELS: ModelOption[] = [
  { id: 'ruai-lite', name: 'Быстрая модель', hint: 'Быстрые ответы', requiresPlan: false },
  { id: 'ruai-pro', name: 'Умная модель', hint: 'Сложные задачи и код', requiresPlan: true },
  { id: 'ruai-think', name: 'Думающая модель', hint: 'Глубокие рассуждения', requiresPlan: true },
]
