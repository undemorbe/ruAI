import { beforeEach, describe, expect, it } from 'vitest'
import { dismissFor, isDismissed } from '../dismiss'

describe('скрытие на время', () => {
  beforeEach(() => localStorage.clear())

  it('скрыто до срока, потом снова видно', () => {
    const now = Date.parse('2026-11-16T09:00:00Z')
    expect(isDismissed('banner', now)).toBe(false)
    dismissFor('banner', 86_400_000, now)
    expect(isDismissed('banner', now + 86_399_000)).toBe(true)
    expect(isDismissed('banner', now + 86_400_001)).toBe(false)
    expect(isDismissed('other', now)).toBe(false)
  })

  it('мусор в хранилище не скрывает плашку', () => {
    localStorage.setItem('ruai.dismiss.banner', '"forever"')
    expect(isDismissed('banner')).toBe(false)
  })
})
