import type { LimitCode, Message, Usage } from '@/api/types'
import { LIMITS } from '@/config/app'

/**
 * Чистые функции правил запроса. Сервер обязан применять те же правила сам;
 * здесь они нужны мок-бэкенду, тестам и подсказкам в интерфейсе.
 */

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000 // Москва: UTC+3 круглый год

/** Ключ московских суток, например `2026-11-13`. */
export function mskDayKey(now: Date): string {
  return new Date(now.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10)
}

/** Следующая полночь по Москве (момент суточного сброса). */
export function nextMskMidnight(now: Date): Date {
  const msk = new Date(now.getTime() + MSK_OFFSET_MS)
  const midnightMsk = Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate() + 1)
  return new Date(midnightMsk - MSK_OFFSET_MS)
}

/** Грубая оценка токенов (кириллица ≈ 3 символа на токен). Точный подсчёт — на сервере. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3)

/**
 * Контекст для OpenRouter: не больше 20 последних сообщений чата; если они вместе
 * длиннее лимита входных токенов, старые сообщения отбрасываются. Последнее
 * (новое) сообщение остаётся всегда — если оно само длиннее лимита, запрос отклоняется
 * с кодом `too_long` до вызова модели.
 */
export function buildContext<T extends Pick<Message, 'content'>>(
  history: T[],
  maxMessages: number = LIMITS.contextMessages,
  maxTokens: number = LIMITS.inputTokens,
): T[] {
  const ctx = history.slice(-maxMessages)
  let total = ctx.reduce((s, m) => s + estimateTokens(m.content), 0)
  while (ctx.length > 1 && total > maxTokens) total -= estimateTokens(ctx.shift()!.content)
  return ctx
}

/** Проверка частоты: не больше 5 запросов в минуту и 50 в час. Возвращает секунды ожидания. */
export function rateWait(history: number[], now: number): number {
  const minute = history.filter((t) => now - t < 60_000)
  const hour = history.filter((t) => now - t < 3_600_000)
  let wait = 0
  if (minute.length >= LIMITS.perMinute) wait = Math.max(wait, 60_000 - (now - Math.min(...minute)))
  if (hour.length >= LIMITS.perHour) wait = Math.max(wait, 3_600_000 - (now - Math.min(...hour)))
  return Math.ceil(wait / 1000)
}

/** Счётчики с учётом суточного сброса (если сутки по Москве сменились). */
export function freshUsage(u: Usage, now: Date): Usage {
  if (now.getTime() < Date.parse(u.dailyResetAt)) return u
  return { ...u, dailyUsed: 0, dailyResetAt: nextMskMidnight(now).toISOString() }
}

/** Сколько запросов можно сделать прямо сейчас: минимум из суточного и общего остатка. */
export function remaining(u: Usage): number {
  return Math.max(0, Math.min(u.dailyLimit - u.dailyUsed, u.totalLimit - u.totalUsed))
}

function waitText(sec: number): string {
  if (sec < 60) return `${sec} с`
  const m = Math.ceil(sec / 60)
  return `${m} мин`
}

/** Понятный текст отказа для пользователя. */
export function limitMessage(code: LimitCode | undefined, retryAfter?: number): string {
  switch (code) {
    case 'no_subscription':
      return 'Чтобы отправлять запросы, оформите подписку. История чатов сохранится.'
    case 'daily_limit':
      return 'Суточный лимит запросов исчерпан. Он обновится в 00:00 по Москве.'
    case 'total_limit':
      return 'Запросы этого периода закончились. Продлите подписку, чтобы продолжить.'
    case 'budget':
      return 'Лимит подписки исчерпан. Продлите подписку, чтобы продолжить.'
    case 'rate_limit':
      return `Слишком часто: не больше ${LIMITS.perMinute} запросов в минуту и ${LIMITS.perHour} в час.${retryAfter ? ` Повторите через ${waitText(retryAfter)}.` : ''}`
    case 'busy':
      return 'Дождитесь ответа на предыдущий запрос.'
    case 'too_long':
      return 'Сообщение слишком длинное. Сократите его или разбейте на части.'
    case 'upstream':
      return 'Модель не ответила. Попробуйте ещё раз — запрос не списан.'
    default:
      return 'Не удалось получить ответ'
  }
}

/** Коды, при которых помогает только оплата. */
export const PAYWALL_CODES: LimitCode[] = ['no_subscription', 'total_limit', 'budget']
