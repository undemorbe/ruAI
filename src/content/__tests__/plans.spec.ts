import { describe, expect, it } from 'vitest'
import { getPlans, pricePerRequest } from '../plans'

describe('plans', () => {
  it('matches the published economics', () => {
    expect(getPlans().map((p) => [p.id, p.periodDays, p.price, p.requestsTotal, p.requestsPerDay])).toEqual([
      ['week', 7, 388, 500, 100],
      ['month', 30, 988, 1500, 200],
      ['quarter', 90, 1880, 4500, 200],
    ])
  })

  it('daily limit × period covers the total', () => {
    for (const p of getPlans()) expect(p.requestsPerDay * p.periodDays).toBeGreaterThanOrEqual(p.requestsTotal)
  })

  it('longer periods are cheaper per request', () => {
    const [w, m, q] = getPlans().map(pricePerRequest)
    expect(w).toBeGreaterThan(m!)
    expect(m).toBeGreaterThan(q!)
  })

  it('never promises media features', () => {
    for (const p of getPlans()) for (const f of p.features) expect(f.text).not.toMatch(/изображен|файл|фото/i)
  })

  it('exactly one popular plan', () => {
    expect(getPlans().filter((p) => p.popular)).toHaveLength(1)
  })
})
