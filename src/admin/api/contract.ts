import type {
  AdminSession,
  AdminSettings,
  AnalyticsReport,
  ApiReport,
  AuditEntry,
  DateRange,
  PlanId,
  PlanTier,
  FinanceReport,
  ImagesReport,
  InviteInfo,
  Overview,
  PaymentsReport,
  RequestsPage,
  RequestsQuery,
  SubEdit,
  UserDetail,
  UserEdit,
  UsersPage,
  UsersQuery,
} from './types'

/**
 * API админки. Сессия - HttpOnly-cookie `__Host-ruai_admin`, выданная после пароля и TOTP;
 * токены в JS не попадают. Все запросы - по секретному пути `/<ADMIN_PATH>/api/…`.
 * Отчёты - за диапазон дат (включительно, дни по UTC).
 */
export interface AdminService {
  /** Текущая сессия или null (401). */
  session(): Promise<AdminSession | null>
  login(input: { login: string; password: string; code: string }): Promise<AdminSession>
  logout(): Promise<void>
  /** Приглашение по одноразовой ссылке (без сессии); недействительное или истёкшее - 404. */
  inviteInfo(token: string): Promise<InviteInfo>
  /** Создать аккаунт по приглашению: пароль от 14 символов и первый код из приложения. */
  acceptInvite(input: { token: string; password: string; code: string }): Promise<{ login: string }>
  overview(r: DateRange): Promise<Overview>
  analytics(r: DateRange): Promise<AnalyticsReport>
  payments(r: DateRange): Promise<PaymentsReport>
  api(r: DateRange): Promise<ApiReport>
  images(r: DateRange): Promise<ImagesReport>
  users(q: UsersQuery): Promise<UsersPage>
  finance(r: DateRange): Promise<FinanceReport>
  settings(): Promise<AdminSettings>
  saveSettings(s: AdminSettings): Promise<AdminSettings>
  audit(): Promise<AuditEntry[]>
  /** Лента запросов к модели (вопрос, ответ, картинки, цена); с userId - одного пользователя. */
  requests(q: RequestsQuery): Promise<RequestsPage>
  /** Адрес картинки запроса для <img> (сессия - в cookie). */
  imageUrl(id: string): string
  /** Карточка: подписка со счётчиками, платежи, история, активность. */
  user(userId: string): Promise<UserDetail>
  /** Выдать подписку (без оплаты, платёж 0 ₽ в отчётах). */
  grant(userId: string, tier: PlanTier, planId: PlanId): Promise<void>
  /** Правка текущей подписки: срок, лимит запросов, бюджет, автопродление, завершение. */
  editSubscription(userId: string, edit: SubEdit): Promise<void>
  /** Email для чеков и заметка. */
  editUser(userId: string, edit: UserEdit): Promise<void>
  /** Закрыть все сессии пользователя без блокировки. */
  logoutUser(userId: string): Promise<void>
  /** Блокировка закрывает вход и все сессии пользователя. */
  setBlocked(userId: string, blocked: boolean): Promise<void>
  /** Удаление аккаунта и истории; логин - подтверждение. Необратимо. */
  removeUser(userId: string, login: string): Promise<void>
}
