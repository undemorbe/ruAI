import { describe, expect, it } from 'vitest'
import { defaultAdminSettings } from '@/admin/demo/dataset'
import { COST } from '@/api/mocks'
import type { PlanId } from '@/api/types'
import { PLAN_TABLE, PRICES } from '@/content/plans'

/**
 * Средний запрос: ~1500 токенов на входе (с историей), ~500 на выходе; в тарифе с фото
 * ещё ~500 токенов рассуждений (effort low).
 */
const avgRequestUsd = (tier: 'text' | 'media') => (1500 * COST[tier].input + (tier === 'media' ? 1000 : 500) * COST[tier].output) / 1e6
/** Картинка: генерация (цена из настроек) плюс работа модели чата над описанием. */
const imageUsd = defaultAdminSettings().imageCostUsd + avgRequestUsd('media')

describe('экономика тарифов по умолчанию', () => {
  const s = defaultAdminSettings()
  const plans = Object.keys(PLAN_TABLE) as PlanId[]

  it('бюджет подписки не больше цены и покрывает весь объём запросов текстового тарифа', () => {
    for (const id of plans) {
      expect(s.budgetsRub.text[id]).toBeLessThan(PRICES.text[id])
      expect(s.budgetsRub.media[id]).toBeLessThan(PRICES.media[id])
      expect(PLAN_TABLE[id].requestsTotal * avgRequestUsd('text') * s.usdRub).toBeLessThan(s.budgetsRub.text[id])
    }
  })

  it('генерации ограничены и вместе со всеми запросами укладываются в бюджет расширенного тарифа', () => {
    for (const id of plans) {
      const gens = s.generationLimits[id]
      expect(gens, id).not.toBeNull()
      expect(gens!).toBeGreaterThan(0)
      expect(gens!).toBeLessThanOrEqual(PLAN_TABLE[id].requestsTotal)
      const usd = gens! * imageUsd + (PLAN_TABLE[id].requestsTotal - gens!) * avgRequestUsd('media')
      expect(usd * s.usdRub, id).toBeLessThan(s.budgetsRub.media[id])
      // запас: даже вдвое дороже картинки всё ещё в бюджете
      const worst = gens! * (2 * s.imageCostUsd + avgRequestUsd('media')) + (PLAN_TABLE[id].requestsTotal - gens!) * avgRequestUsd('media')
      expect(worst * s.usdRub, id).toBeLessThan(s.budgetsRub.media[id])
    }
  })
})
