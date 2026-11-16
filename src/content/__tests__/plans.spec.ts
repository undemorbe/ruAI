import { describe, expect, it } from 'vitest'
import { MODEL_NAME, MODELS } from '@/config/app'
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
      expect(p.model).toBe('ChatGPT-6.1 Astra')
      expect(p.features[0]!.text).toBe('Модель ChatGPT-6.1 Astra')
      expect(p.features.some((f) => /генерац/i.test(f.text))).toBe(true)
    }
  })

  it('both tiers carry the public model name, the OpenRouter id stays internal', () => {
    expect(MODEL_NAME).toBe('ChatGPT-6.1 Astra')
    expect(MODELS.text.name).toBe(MODEL_NAME)
    expect(MODELS.media.name).toBe(MODEL_NAME)
    for (const p of getPlans()) expect(p.model).toBe(MODEL_NAME)
  })

  it('text tier never promises images and never names the model in features (main page shows them)', () => {
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
