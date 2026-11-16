import { describe, expect, it } from 'vitest'
import { checkSubEdit, checkUserEdit, cleanNote, expiryOf } from '../edits'
import { checkRange, lastDays, monthCells, monthsOf, parseDay, PRESETS, presetOf, prevRange, rangeDays, rangeLabel, spanOf } from '../range'

const NOW = Date.UTC(2026, 10, 16, 12)

describe('диапазон дат', () => {
  it('разбор дат: только настоящие дни', () => {
    expect(parseDay('2026-02-28')).toBe(Date.UTC(2026, 1, 28))
    expect(parseDay('2026-02-30')).toBeNull()
    expect(parseDay('2026-2-3')).toBeNull()
    expect(parseDay('2026-11-16T00:00')).toBeNull()
  })

  it('пресеты и предыдущий период', () => {
    expect(lastDays(7, NOW)).toEqual({ from: '2026-11-10', to: '2026-11-16' })
    expect(rangeDays(lastDays(30, NOW))).toBe(30)
    expect(prevRange({ from: '2026-11-10', to: '2026-11-16' })).toEqual({ from: '2026-11-03', to: '2026-11-09' })
    const pm = PRESETS.find((p) => p.id === 'prev-month')!.range(NOW)
    expect(pm).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(PRESETS.find((p) => p.id === 'month')!.range(NOW)).toEqual({ from: '2026-11-01', to: '2026-11-16' })
    expect(presetOf(lastDays(90, NOW), NOW)).toBe('90')
    expect(presetOf({ from: '2026-11-02', to: '2026-11-05' }, NOW)).toBeNull()
  })

  it('проверка диапазона из запроса', () => {
    expect(checkRange('2026-11-01', '2026-11-16', NOW)).toEqual({ from: '2026-11-01', to: '2026-11-16' })
    expect(checkRange('2026-11-17', '2026-11-17', NOW)).toEqual({ from: '2026-11-17', to: '2026-11-17' })
    for (const [a, b] of [
      ['2026-11-10', '2026-11-01'],
      ['2026-11-01', '2026-11-19'],
      ['2025-01-01', '2026-11-16'],
      ['2022-01-01', '2022-01-02'],
      ['2026-13-01', '2026-11-16'],
      [undefined, '2026-11-16'],
      [1, 2],
    ]) {
      expect(typeof checkRange(a, b, NOW)).toBe('string')
    }
  })

  it('сетка месяца с понедельника и месяцы диапазона', () => {
    const nov = monthCells(2026, 10) // 1 ноября 2026 - воскресенье
    expect(nov[0]!.slice(0, 6).every((x) => x === null)).toBe(true)
    expect(nov[0]![6]).toBe(Date.UTC(2026, 10, 1))
    expect(nov.flat().filter((x) => x !== null).length).toBe(30)
    expect(nov.every((w) => w.length === 7)).toBe(true)
    expect(monthsOf({ from: '2025-12-20', to: '2026-02-03' }).map((m) => `${m.year}-${m.month}`)).toEqual(['2025-11', '2026-0', '2026-1'])
    expect(spanOf(Date.UTC(2026, 10, 9), Date.UTC(2026, 10, 2))).toEqual({ from: '2026-11-02', to: '2026-11-09' })
  })

  it('подпись без длинного тире', () => {
    expect(rangeLabel({ from: '2026-11-01', to: '2026-11-30' })).toBe('01.11 - 30.11.2026')
    expect(rangeLabel({ from: '2025-12-30', to: '2026-01-02' })).toBe('30.12.2025 - 02.01.2026')
    expect(rangeLabel({ from: '2026-11-16', to: '2026-11-16' })).toBe('16.11.2026')
  })
})

describe('правки из админки', () => {
  it('подписка: границы и сочетания', () => {
    expect(checkSubEdit({ expiresOn: '2026-12-31' }, NOW)).toBeNull()
    expect(checkSubEdit({ totalLimitDelta: -50, budgetDeltaRub: 99.5, autoRenew: false, resetDaily: true }, NOW)).toBeNull()
    expect(checkSubEdit({ end: true }, NOW)).toBeNull()
    for (const e of [{}, { expiresOn: '2026-11-15' }, { expiresOn: '2028-06-01' }, { expiresOn: 'завтра' }, { totalLimitDelta: 0 }, { totalLimitDelta: 2.5 }, { budgetDeltaRub: 1e6 }, { end: true, autoRenew: true }]) {
      expect(checkSubEdit(e, NOW), JSON.stringify(e)).not.toBeNull()
    }
    // 23:59:59.999 по Москве
    expect(expiryOf('2026-12-31')).toBe(Date.UTC(2026, 11, 31, 20, 59, 59, 999))
  })

  it('профиль: email и заметка', () => {
    expect(checkUserEdit({ email: ' User@Mail.RU ' })).toBeNull()
    expect(checkUserEdit({ email: 'nope' })).not.toBeNull()
    expect(checkUserEdit({ email: 'a@b' })).not.toBeNull()
    expect(checkUserEdit({ email: 'x"y@mail.ru' })).not.toBeNull()
    expect(checkUserEdit({})).not.toBeNull()
    expect(checkUserEdit({ note: 'x'.repeat(1001) })).not.toBeNull()
    expect(cleanNote(' a\r\nb\u0000\u0007 ')).toBe('a\nb')
  })
})
