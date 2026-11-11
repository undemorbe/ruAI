import { describe, expect, it } from 'vitest'
import { getPlans } from '../plans'

describe('plans', () => {
  it('text tier matches the published prices', () => {
    const p = getPlans('text')
    expect(p.map((x) => [x.id, x.price, x.oldPrice])).toEqual([
      ['week', 388, 688],
      ['month', 988, 1288],
      ['quarter', 1880, 2880],
    ])
  })

  it('media tier costs more and mentions images', () => {
    const text = getPlans('text')
    const media = getPlans('media')
    media.forEach((m, i) => {
      expect(m.price).toBeGreaterThan(text[i]!.price)
      expect(m.tier).toBe('media')
    })
    expect(media.some((m) => m.features.length > text[0]!.features.length)).toBe(true)
  })

  it('exactly one popular plan', () => {
    expect(getPlans('text').filter((p) => p.popular)).toHaveLength(1)
  })
})
