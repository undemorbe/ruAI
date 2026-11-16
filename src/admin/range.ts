/**
 * Диапазон дат отчётов: включительно, дни по UTC (так агрегируются расходы в базе).
 * Модуль без импортов: его используют и UI, и server/ (проверка параметров запроса).
 */
export interface DateRange {
  /** YYYY-MM-DD, первый день. */
  from: string
  /** YYYY-MM-DD, последний день (включительно). */
  to: string
}

export const DAY = 86_400_000
/** Самый длинный диапазон отчёта. */
export const MAX_RANGE_DAYS = 366
/** Самая ранняя дата, которую принимает сервер (от сегодняшнего дня). */
export const MAX_BACK_DAYS = 3 * 365

const ISO = /^\d{4}-\d{2}-\d{2}$/

export const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY
export const isoDay = (ms: number) => new Date(dayStart(ms)).toISOString().slice(0, 10)

/** Строка YYYY-MM-DD → начало дня в мс или null, если дата не настоящая (2026-02-30). */
export function parseDay(s: string): number | null {
  if (!ISO.test(s)) return null
  const ms = Date.parse(`${s}T00:00:00Z`)
  return Number.isFinite(ms) && isoDay(ms) === s ? ms : null
}

/** Границы окна: [start, end) в мс. */
export function bounds(r: DateRange): { start: number; end: number } {
  return { start: parseDay(r.from)!, end: parseDay(r.to)! + DAY }
}

export const rangeDays = (r: DateRange) => Math.round((parseDay(r.to)! - parseDay(r.from)!) / DAY) + 1

/** Последние N дней, включая сегодня. */
export const lastDays = (n: number, now = Date.now()): DateRange => ({ from: isoDay(now - (n - 1) * DAY), to: isoDay(now) })

/** Такой же по длине период прямо перед этим - для сравнения. */
export function prevRange(r: DateRange): DateRange {
  const n = rangeDays(r)
  const start = parseDay(r.from)!
  return { from: isoDay(start - n * DAY), to: isoDay(start - DAY) }
}

/**
 * Проверка диапазона из запроса. Ошибка - текст для ответа 400.
 * Будущие дни не принимаются (до завтра включительно - запас на часовые пояса).
 */
export function checkRange(from: unknown, to: unknown, now = Date.now()): DateRange | string {
  if (typeof from !== 'string' || typeof to !== 'string') return 'Нужны даты from и to'
  const a = parseDay(from)
  const b = parseDay(to)
  if (a === null || b === null) return 'Дата в формате ГГГГ-ММ-ДД'
  if (a > b) return 'Начало позже конца'
  if (b > dayStart(now) + DAY) return 'Диапазон в будущем'
  if (a < dayStart(now) - MAX_BACK_DAYS * DAY) return 'Слишком давно'
  if ((b - a) / DAY + 1 > MAX_RANGE_DAYS) return `Не больше ${MAX_RANGE_DAYS} дней`
  return { from, to }
}

export interface RangePreset {
  id: string
  label: string
  range: (now?: number) => DateRange
}

export const PRESETS: RangePreset[] = [
  { id: 'today', label: 'Сегодня', range: (now = Date.now()) => lastDays(1, now) },
  { id: '7', label: '7 дней', range: (now) => lastDays(7, now) },
  { id: '30', label: '30 дней', range: (now) => lastDays(30, now) },
  { id: '90', label: '90 дней', range: (now) => lastDays(90, now) },
  {
    id: 'month',
    label: 'Этот месяц',
    range: (now = Date.now()) => {
      const d = new Date(now)
      return { from: isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), to: isoDay(now) }
    },
  },
  {
    id: 'prev-month',
    label: 'Прошлый месяц',
    range: (now = Date.now()) => {
      const d = new Date(now)
      const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
      return { from: isoDay(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)), to: isoDay(first - DAY) }
    },
  },
  { id: '365', label: 'Год', range: (now) => lastDays(365, now) },
]

/** Какой пресет совпадает с диапазоном (для подсветки кнопки). */
export const presetOf = (r: DateRange, now = Date.now()) => PRESETS.find((p) => {
  const x = p.range(now)
  return x.from === r.from && x.to === r.to
})?.id ?? null

/** Сетка месяца: недели с понедельника, null - дни соседних месяцев. */
export function monthCells(year: number, month: number): (number | null)[][] {
  const first = Date.UTC(year, month, 1)
  const days = Math.round((Date.UTC(year, month + 1, 1) - first) / DAY)
  const lead = (new Date(first).getUTCDay() + 6) % 7
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => first + i * DAY)]
  while (cells.length % 7) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** Месяцы (год, месяц), которые задевает диапазон. */
export function monthsOf(r: DateRange): { year: number; month: number }[] {
  const a = new Date(parseDay(r.from)!)
  const b = new Date(parseDay(r.to)!)
  const out: { year: number; month: number }[] = []
  for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth()); m === 11 ? (y++, (m = 0)) : m++) {
    out.push({ year: y, month: m })
  }
  return out
}

/** Упорядоченный диапазон из двух дней в любом порядке. */
export const spanOf = (a: number, b: number): DateRange => ({ from: isoDay(Math.min(a, b)), to: isoDay(Math.max(a, b)) })

/** «01.11 - 30.11.2026» */
export function rangeLabel(r: DateRange): string {
  const f = (s: string, year: boolean) => {
    const [y, m, d] = s.split('-')
    return year ? `${d}.${m}.${y}` : `${d}.${m}`
  }
  if (r.from === r.to) return f(r.from, true)
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4)
  return `${f(r.from, !sameYear)} - ${f(r.to, true)}`
}
