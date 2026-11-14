import type { Plan, PlanId, PlanTier } from '@/api/types'
import { MODELS } from '@/config/app'

interface PlanBase {
  title: string
  periodDays: number
  requestsTotal: number
  requestsPerDay: number
  tagline: string
  features: { icon: string; text: string }[]
}

/**
 * Экономика. Лимиты запросов общие для всех чатов и одинаковые для обоих тарифов;
 * отличаются цена и модель. Технические ограничения (контекст, токены, частота) —
 * защита сервера, на витрине их не показываем.
 */
export const PLAN_TABLE: Record<PlanId, PlanBase> = {
  week: {
    title: '7 дней',
    periodDays: 7,
    requestsTotal: 500,
    requestsPerDay: 100,
    tagline: 'Расширенный доступ к интеллекту для повседневных задач',
    features: [
      { icon: 'spark', text: 'Простые и понятные объяснения' },
      { icon: 'bubble', text: 'Письма, посты и ответы на вопросы' },
      { icon: 'brain', text: 'Помощь с учёбой и домашними заданиями' },
    ],
  },
  month: {
    title: '30 дней',
    periodDays: 30,
    requestsTotal: 1500,
    requestsPerDay: 200,
    tagline: 'Делайте больше каждый день',
    features: [
      { icon: 'spark', text: 'Решение сложных задач и кода' },
      { icon: 'bubble', text: 'Длинные диалоги в нескольких чатах' },
      { icon: 'brain', text: 'Тексты для работы в нужном тоне' },
      { icon: 'route', text: 'Планы поездок, тренировок и проектов' },
    ],
  },
  quarter: {
    title: '90 дней',
    periodDays: 90,
    requestsTotal: 4500,
    requestsPerDay: 200,
    tagline: 'Максимум запросов по самой выгодной цене',
    features: [
      { icon: 'spark', text: 'Продвинутые исследования и темы' },
      { icon: 'bubble', text: 'Большие проекты и сложные проблемы' },
      { icon: 'brain', text: 'Код, аналитика и длинные тексты' },
      { icon: 'route', text: 'Исследования и задачи планирования' },
    ],
  },
}

export const PRICES: Record<PlanTier, Record<PlanId, number>> = {
  text: { week: 388, month: 988, quarter: 1880 },
  media: { week: 788, month: 1988, quarter: 3880 },
}

const MEDIA_FEATURES = [
  { icon: 'image', text: 'Анализ фото: распознаёт, объясняет, отвечает по снимку' },
  { icon: 'pen', text: 'Генерация и редактирование изображений' },
]

export const TIER_LABEL: Record<PlanTier, string> = {
  text: 'Без изображений',
  media: 'С фото и изображениями',
}

export const fmt = (n: number) => n.toLocaleString('ru-RU')

export function getPlans(tier: PlanTier = 'text'): Plan[] {
  return (Object.keys(PLAN_TABLE) as PlanId[]).map((id) => {
    const { features, ...p } = PLAN_TABLE[id]
    return {
      id,
      tier,
      model: MODELS[tier].name,
      ...p,
      price: PRICES[tier][id],
      currency: 'RUB',
      features: [
        ...(tier === 'media' ? [{ icon: 'bolt', text: `Модель ${MODELS.media.name}` }, ...MEDIA_FEATURES] : []),
        ...features,
        { icon: 'check', text: 'История всех чатов сохраняется' },
      ],
      popular: id === 'month',
    }
  })
}

export const getPlan = (tier: PlanTier, id: PlanId) => getPlans(tier).find((p) => p.id === id)!

/** Цена одного запроса при полном использовании периода. */
export const pricePerRequest = (p: Pick<Plan, 'price' | 'requestsTotal'>) =>
  Math.round((p.price / p.requestsTotal) * 100) / 100
