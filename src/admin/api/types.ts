/**
 * Контракт админки. Реализации: server/ (настоящий API за секретным путём)
 * и mock для локальной разработки. Все суммы выручки - в рублях, расходы OpenRouter - в долларах
 * (как их считает OpenRouter) с пересчётом в рубли по курсу из настроек.
 */
import type { AdminSettings, PlanId, PlanTier } from '../../api/types'

export type { AdminSettings, PlanId, PlanTier }

import type { DateRange } from '../range'
export type { DateRange }

export type ISODate = string

export interface AdminSession {
  login: string
  expiresAt: ISODate
  /** Демо-данные вместо базы - показываем плашку. */
  demo: boolean
}

export interface DayPoint {
  date: string
  revenueRub: number
  apiRub: number
}

export interface OverviewTotals {
  revenueRub: number
  registrations: number
  newSubscriptions: number
  activeSubscriptions: number
  renewals: number
  cancellations: number
  openrouterUsd: number
  openrouterRub: number
  /** Пользователи, у которых были запросы в периоде. */
  activeUsers: number
  requests: number
}
export interface Overview extends OverviewTotals {
  series: DayPoint[]
  /** Те же показатели за такой же период до этого (activeSubscriptions - на конец того периода). */
  compare: OverviewTotals
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
  /** Последние платежи периода (до 50). */
  recent: PaymentRow[]
  /** Подписки, которые заканчиваются в ближайшие 14 дней. */
  expiring: { userId: string; login: string; tier: PlanTier; planId: PlanId; expiresAt: ISODate; autoRenew: boolean }[]
}

export interface PaymentRow {
  id: string
  userId: string
  login: string
  at: ISODate
  tier: PlanTier
  planId: PlanId
  amount: number
  status: 'succeeded' | 'failed'
  refunded: boolean
  repeat: boolean
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
  topUsers: { userId: string; login: string; usd: number; requests: number }[]
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
  login: string
  /** Email для кассовых чеков: появляется при первой оплате. */
  email: string | null
  /** Подключён Telegram-бот входа (2FA и восстановление). Сам id Telegram в панель не отдаётся. */
  telegram: boolean
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
  /** Аккаунт заблокирован: вход и запросы закрыты. */
  blocked?: boolean
}

export type UserSort = 'spend' | 'paid' | 'registered' | 'active'
export type UserFilter = 'all' | 'active' | 'none' | 'expiring' | 'blocked' | 'no_tg'
export interface UsersQuery {
  q?: string
  sort?: UserSort
  filter?: UserFilter
  page?: number
}
export interface UsersPage {
  total: number
  page: number
  pageSize: number
  items: AdminUser[]
}

export interface FinanceTotals {
  revenueRub: number
  refundsRub: number
  apiRub: number
  grossRub: number
  marginPct: number
  avgCheckRub: number
  arpuRub: number
  payingUsers: number
}
export interface FinanceReport extends FinanceTotals {
  compare: FinanceTotals
  byPlan: { tier: PlanTier; planId: PlanId; revenueRub: number; apiRub: number; marginPct: number }[]
  series: DayPoint[]
}

// ---------- аналитика ----------

export interface DayStats {
  date: string
  revenueRub: number
  apiRub: number
  requests: number
  registrations: number
  activeUsers: number
  payments: number
  generations: number
}

export interface CohortRow {
  label: string
  start: string
  size: number
  /** Доля купивших подписку, %. */
  paidPct: number
  /** Доля активных в периоде k после начала когорты, %; null - период ещё не наступил. */
  retention: (number | null)[]
}

export interface AnalyticsReport {
  days: DayStats[]
  /** Зарегистрированные в периоде → делали запросы → оплатили → оплатили повторно. */
  funnel: { registered: number; active: number; paid: number; repeat: number }
  activity: {
    activeUsers: number
    avgDau: number
    peakDau: number
    peakDate: string | null
    requestsPerActive: number
    /** Средний DAU / активные за период, %. */
    stickiness: number
  }
  /** Среднее за день по дням недели, 0 - понедельник. */
  weekday: { day: number; requests: number; revenueRub: number; registrations: number }[]
  cohorts: { unit: 'week' | 'month'; rows: CohortRow[] }
  payback: { medianDaysToPay: number | null; ltvRub: number; payingUsers: number }
}

// ---------- карточка пользователя ----------

export interface UserSub {
  id: string
  tier: PlanTier
  planId: PlanId
  source: 'payment' | 'admin'
  startedAt: ISODate
  expiresAt: ISODate
  autoRenew: boolean
  totalLimit: number
  totalUsed: number
  dailyLimit: number
  dailyUsed: number
  genUsed: number
  budgetRub: number
  spentRub: number
}

export interface UserDetail {
  user: AdminUser
  note: string
  /** Открытые сессии (входы на устройствах). */
  sessions: number
  sub: UserSub | null
  history: { id: string; tier: PlanTier; planId: PlanId; source: 'payment' | 'admin'; startedAt: ISODate; expiresAt: ISODate }[]
  payments: PaymentRow[]
  /** Активность по дням за последние 60 дней. */
  days: { date: string; requests: number; usd: number; generations: number; errors: number }[]
}

/** Правка текущей подписки; поля необязательны, хотя бы одно. */
export interface SubEdit {
  /** Новая дата окончания (YYYY-MM-DD, конец дня по UTC). */
  expiresOn?: string
  /** Добавить (или убрать) запросов к общему лимиту. */
  totalLimitDelta?: number
  /** Добавить (или убрать) ₽ к внутреннему бюджету. */
  budgetDeltaRub?: number
  autoRenew?: boolean
  /** Обнулить счётчик за сегодня. */
  resetDaily?: boolean
  /** Завершить подписку сейчас. */
  end?: boolean
}

export interface UserEdit {
  /** Email для чеков; во входе не участвует. */
  email?: string
  /** Заметка администратора, видна только в панели. */
  note?: string
}

export interface AuditEntry {
  at: ISODate
  ip: string
  action:
    | 'login'
    | 'login_failed'
    | 'logout'
    | 'settings'
    | 'locked'
    | 'grant'
    | 'block'
    | 'unblock'
    | 'delete_user'
    | 'edit_sub'
    | 'edit_user'
    | 'logout_user'
    | 'admin_added'
    | 'invite_failed'
  detail?: string
  /** Кто из администраторов сделал (для действий после входа). */
  by?: string
}

/** Приглашение администратора: что показать на странице подключения. */
export interface InviteInfo {
  login: string
  /** TOTP-секрет base32 - для ручного ввода в приложение-аутентификатор. */
  secret: string
  /** otpauth://… - для QR-кода и открытия на телефоне. */
  uri: string
  expiresAt: ISODate
}
