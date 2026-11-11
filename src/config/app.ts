export const APP_NAME = 'ruAI'
export const SUPPORT_EMAIL = 'support@ruai.example'
export const TELEGRAM_URL = 'https://t.me/'

export interface ModelOption {
  id: string
  name: string
  hint: string
  requiresPlan: boolean
}

export const MODELS: ModelOption[] = [
  { id: 'ruai-lite', name: 'ruAI Lite', hint: 'Быстрые ответы', requiresPlan: false },
  { id: 'ruai-pro', name: 'ruAI Pro', hint: 'Сложные задачи и код', requiresPlan: true },
  { id: 'ruai-think', name: 'ruAI Think', hint: 'Глубокие рассуждения', requiresPlan: true },
]
