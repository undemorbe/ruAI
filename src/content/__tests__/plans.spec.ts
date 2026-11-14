import { describe, expect, it } from 'vitest'
import { getPlans, pricePerRequest } from '../plans'

describe('plans', () => {
  it('text tier matches the published economics', () => {
    expect(getPlans('text').map((p) => [p.id, p.periodDays, p.price, p.requestsTotal, p.requestsPerDay])).toEqual([
      ['week', 7, 388, 500, 100],
      ['month', 30, 988, 1500, 200],
      ['quarter', 90, 1880, 4500, 200],
    ])
  })

  it('media tier: same limits, its own prices and model', () => {
    const media = getPlans('media')
    expect(media.map((p) => [p.id, p.price, p.requestsTotal, p.requestsPerDay])).toEqual([
      ['week', 788, 500, 100],
      ['month', 1988, 1500, 200],
      ['quarter', 3880, 4500, 200],
    ])
    for (const p of media) {
      expect(p.model).toBe('GPT-5.6 Luna')
      expect(p.features.some((f) => /генерац/i.test(f.text))).toBe(true)
    }
  })

  it('text tier never promises images and never names the model', () => {
    for (const p of getPlans('text')) {
      for (const f of p.features) expect(f.text).not.toMatch(/изображен|фото|gpt|oss/i)
    }
  })

  it('no internal limits on the storefront', () => {
    for (const tier of ['text', 'media'] as const)
      for (const p of getPlans(tier)) for (const f of [p.tagline, ...p.features.map((x) => x.text)]) expect(f).not.toMatch(/токен|контекст|в минуту|в час/i)
  })

  it('daily limit × period covers the total; longer periods are cheaper per request', () => {
    for (const p of getPlans()) expect(p.requestsPerDay * p.periodDays).toBeGreaterThanOrEqual(p.requestsTotal)
    const [w, m, q] = getPlans().map(pricePerRequest)
    expect(w).toBeGreaterThan(m!)
    expect(m).toBeGreaterThan(q!)
  })

  it('exactly one popular plan', () => {
    expect(getPlans().filter((p) => p.popular)).toHaveLength(1)
  })
})
