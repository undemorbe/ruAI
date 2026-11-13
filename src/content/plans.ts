import type { Plan, PlanId } from '@/api/types'
import { LIMITS, MODEL } from '@/config/app'

interface PlanBase {
  title: string
  periodDays: number
  price: number
  requestsTotal: number
  requestsPerDay: number
  tagline: string
}

/** Экономика: цена, запросы на период и в сутки. Лимиты общие для всех чатов пользователя. */
export const PLAN_TABLE: Record<PlanId, PlanBase> = {
  week: {
    title: '7 дней',
    periodDays: 7,
    price: 388,
    requestsTotal: 500,
    requestsPerDay: 100,
    tagline: 'Попробовать в деле: учёба, письма, быстрые вопросы',
  },
  month: {
    title: '30 дней',
    periodDays: 30,
    price: 988,
    requestsTotal: 1500,
    requestsPerDay: 200,
    tagline: 'Для ежедневной работы с текстами и кодом',
  },
  quarter: {
    title: '90 дней',
    periodDays: 90,
    price: 1880,
    requestsTotal: 4500,
    requestsPerDay: 200,
    tagline: 'Самый низкий расход на запрос — на целый квартал',
  },
}

export const fmt = (n: number) => n.toLocaleString('ru-RU')

export function getPlans(): Plan[] {
  return (Object.keys(PLAN_TABLE) as PlanId[]).map((id) => {
    const p = PLAN_TABLE[id]
    return {
      id,
      ...p,
      currency: 'RUB',
      features: [
        { icon: 'brain', text: `${MODEL.name}: тексты, учёба, код` },
        { icon: 'bubble', text: 'Сколько угодно чатов — лимит общий на все' },
        { icon: 'route', text: `Ответ до ${fmt(LIMITS.outputTokens)} токенов, в контексте ${LIMITS.contextMessages} последних сообщений` },
        { icon: 'spark', text: 'История хранится и после окончания подписки' },
      ],
      popular: id === 'month',
    }
  })
}

/** Цена одного запроса при полном использовании периода. */
export const pricePerRequest = (p: Pick<Plan, 'price' | 'requestsTotal'>) =>
  Math.round((p.price / p.requestsTotal) * 100) / 100
