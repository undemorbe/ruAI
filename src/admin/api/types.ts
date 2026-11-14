/**
 * Контракт админки. Реализации: server/ (настоящий API за секретным путём)
 * и mock для локальной разработки. Все суммы выручки — в рублях, расходы OpenRouter — в долларах
 * (как их считает OpenRouter) с пересчётом в рубли по курсу из настроек.
 */
import type { AdminSettings, PlanId, PlanTier } from '../../api/types'

export type { AdminSettings, PlanId, PlanTier }

export type ISODate = string
/** Период отчёта: последние N дней. */
export type RangeDays = 7 | 30 | 90 | 365

export interface AdminSession {
  login: string
  expiresAt: ISODate
  /** Демо-данные вместо базы — показываем плашку. */
  demo: boolean
}

export interface DayPoint {
  date: string
  revenueRub: number
  apiRub: number
}

export interface Overview {
  revenueRub: number
  registrations: number
  newSubscriptions: number
  activeSubscriptions: number
  renewals: number
  cancellations: number
  openrouterUsd: number
  openrouterRub: number
  series: DayPoint[]
}

export interface PlanSales {
  tier: PlanTier
  planId: PlanId
  price: number
  count: number
  revenueRub: number
}

export interface PaymentsReport {
  byPlan: PlanSales[]
  first: { count: number; revenueRub: number }
  repeat: { count: number; revenueRub: number }
  succeeded: { count: number; revenueRub: number }
  failed: { count: number; amountRub: number }
  refunds: { count: number; amountRub: number }
  /** Подписки, которые заканчиваются в ближайшие 14 дней. */
  expiring: { userId: string; email: string; tier: PlanTier; planId: PlanId; expiresAt: ISODate; autoRenew: boolean }[]
}

export interface ApiReport {
  requests: number
  tokensIn: number
  tokensOut: number
  avgCostUsd: number
  totalUsd: number
  totalRub: number
  byModel: { key: 'text' | 'media' | 'image'; label: string; usd: number; requests: number }[]
  errors: { count: number; rate: number; byCode: { code: string; count: number }[] }
  topUsers: { userId: string; email: string; usd: number; requests: number }[]
}

export interface ImagesReport {
  generations: number
  spendUsd: number
  spendRub: number
  avgCostUsd: number
  /** Подписчики тарифа с изображениями, у которых были генерации. */
  activeUsers: number
  byPlan: { planId: PlanId; generations: number; perSubscription: number }[]
}

export interface AdminUser {
  id: string
  email: string
  registeredAt: ISODate
  tier: PlanTier | null
  planId: PlanId | null
  expiresAt: ISODate | null
  requestsUsed: number
  requestsLeft: number
  generations: number
  paidTotalRub: number
  spendUsd: number
  /** Остаток внутреннего бюджета текущей подписки, ₽. */
  budgetLeftRub: number | null
  lastActiveAt: ISODate | null
}

export type UserSort = 'spend' | 'paid' | 'registered' | 'active'
export interface UsersQuery {
  q?: string
  sort?: UserSort
  page?: number
}
export interface UsersPage {
  total: number
  page: number
  pageSize: number
  items: AdminUser[]
}

export interface FinanceReport {
  revenueRub: number
  refundsRub: number
  apiRub: number
  grossRub: number
  marginPct: number
  avgCheckRub: number
  arpuRub: number
  payingUsers: number
  byPlan: { tier: PlanTier; planId: PlanId; revenueRub: number; apiRub: number; marginPct: number }[]
  series: DayPoint[]
}

export interface AuditEntry {
  at: ISODate
  ip: string
  action: 'login' | 'login_failed' | 'logout' | 'settings' | 'locked'
  detail?: string
}
