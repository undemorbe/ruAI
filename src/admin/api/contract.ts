import type {
  AdminSession,
  AdminSettings,
  ApiReport,
  AuditEntry,
  FinanceReport,
  ImagesReport,
  Overview,
  PaymentsReport,
  RangeDays,
  UsersPage,
  UsersQuery,
} from './types'

/**
 * API админки. Сессия — HttpOnly-cookie `__Host-ruai_admin`, выданная после пароля и TOTP;
 * токены в JS не попадают. Все запросы — по секретному пути `/<ADMIN_PATH>/api/…`.
 */
export interface AdminService {
  /** Текущая сессия или null (401). */
  session(): Promise<AdminSession | null>
  login(input: { login: string; password: string; code: string }): Promise<AdminSession>
  logout(): Promise<void>
  overview(days: RangeDays): Promise<Overview>
  payments(days: RangeDays): Promise<PaymentsReport>
  api(days: RangeDays): Promise<ApiReport>
  images(days: RangeDays): Promise<ImagesReport>
  users(q: UsersQuery): Promise<UsersPage>
  finance(days: RangeDays): Promise<FinanceReport>
  settings(): Promise<AdminSettings>
  saveSettings(s: AdminSettings): Promise<AdminSettings>
  audit(): Promise<AuditEntry[]>
}
