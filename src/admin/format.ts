const nf = new Intl.NumberFormat('ru-RU')
export const num = (n: number) => nf.format(Math.round(n))
export const rub = (n: number) => `${nf.format(Math.round(n))} ₽`
export const usd = (n: number, digits = 2) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
export const pct = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} %`
export const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
/** Компактно: 12,4 тыс., 3,1 млн */
export const compact = (n: number) => new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(n)

export const PLAN_LABEL = { week: '7 дней', month: '30 дней', quarter: '90 дней' } as const
export const TIER_SHORT = { text: 'Текст', media: 'С фото' } as const
export const ERROR_LABEL: Record<string, string> = {
  upstream: 'Модель не ответила',
  timeout: 'Таймаут',
  moderation: 'Модерация',
  too_long: 'Слишком длинный запрос',
}
