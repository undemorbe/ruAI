/**
 * Проверка правок из админки. Без импортов значений: общий модуль для UI, мока и server/.
 * Сервер проверяет ещё раз (JSON-схема + эти правила), UI - чтобы сразу показать ошибку.
 */
import type { SubEdit, UserEdit } from './api/types'
import { DAY, dayStart, parseDay } from './range'

/** Насколько вперёд можно продлить подписку вручную. */
export const MAX_EXTEND_DAYS = 400
export const MAX_NOTE = 1000
export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

/** Москва без перехода на летнее время. */
const MSK = 3 * 3_600_000
/** Окончание подписки для даты YYYY-MM-DD: последний миг этого дня по Москве. */
export const expiryOf = (day: string) => parseDay(day)! + DAY - MSK - 1

export function checkSubEdit(e: SubEdit, now = Date.now()): string | null {
  const keys = Object.keys(e) as (keyof SubEdit)[]
  if (!keys.length) return 'Нечего менять'
  if (e.end !== undefined && e.end !== true) return 'end: только true'
  if (e.end && keys.length > 1) return 'Завершение подписки - отдельным действием'
  if (e.expiresOn !== undefined) {
    const d = parseDay(e.expiresOn)
    if (d === null) return 'Дата окончания в формате ГГГГ-ММ-ДД'
    if (d < dayStart(now)) return 'Дата окончания в прошлом - используйте «Завершить»'
    if (d > dayStart(now) + MAX_EXTEND_DAYS * DAY) return `Не дальше ${MAX_EXTEND_DAYS} дней`
  }
  if (e.totalLimitDelta !== undefined && !(Number.isInteger(e.totalLimitDelta) && Math.abs(e.totalLimitDelta) <= 100_000 && e.totalLimitDelta !== 0))
    return 'Запросы: целое число от −100 000 до 100 000, не 0'
  if (e.budgetDeltaRub !== undefined && !(Number.isFinite(e.budgetDeltaRub) && Math.abs(e.budgetDeltaRub) <= 100_000 && e.budgetDeltaRub !== 0))
    return 'Бюджет: от −100 000 до 100 000 ₽, не 0'
  if (e.resetDaily !== undefined && e.resetDaily !== true) return 'resetDaily: только true'
  return null
}

/** Заметка без управляющих символов (кроме переноса строки). */
export const cleanNote = (s: string) => s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim()

export function checkUserEdit(e: UserEdit): string | null {
  if (e.email === undefined && e.note === undefined) return 'Нечего менять'
  if (e.email !== undefined) {
    const v = e.email.trim().toLowerCase()
    if (v.length > 254 || !EMAIL_RE.test(v)) return 'Неверный email'
  }
  if (e.note !== undefined && cleanNote(e.note).length > MAX_NOTE) return `Заметка до ${MAX_NOTE} символов`
  return null
}
