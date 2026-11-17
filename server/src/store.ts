/**
 * Источник данных админки и файловое хранилище (настройки, журнал, последний шаг TOTP).
 * Отчёты из боевой базы подключаются реализацией AdminRepo поверх неё; до этого сервер
 * отвечает 501, а с ADMIN_DEMO=1 - демо-данными.
 */
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  AdminSettings,
  AnalyticsReport,
  ApiReport,
  AuditEntry,
  DateRange,
  FinanceReport,
  ImagesReport,
  Overview,
  PaymentsReport,
  RequestsPage,
  RequestsQuery,
  UserDetail,
  UsersPage,
  UsersQuery,
} from '../../src/admin/api/types.ts'
import { analyticsReport, userDetail } from '../../src/admin/demo/analytics.ts'
import {
  apiReport,
  buildDataset,
  defaultAdminSettings,
  financeReport,
  imagesReport,
  overview,
  paymentsReport,
  usersPage,
} from '../../src/admin/demo/dataset.ts'
import { DEMO_IMAGE_SVG, demoRequests, isDemoImage, requestsPageOf } from '../../src/admin/demo/requests.ts'

export interface AdminRepo {
  overview(r: DateRange, s: AdminSettings): Promise<Overview>
  analytics(r: DateRange, s: AdminSettings): Promise<AnalyticsReport>
  payments(r: DateRange): Promise<PaymentsReport>
  api(r: DateRange, s: AdminSettings): Promise<ApiReport>
  images(r: DateRange, s: AdminSettings): Promise<ImagesReport>
  users(q: UsersQuery, s: AdminSettings): Promise<UsersPage>
  user(id: string, s: AdminSettings): Promise<UserDetail | null>
  finance(r: DateRange, s: AdminSettings): Promise<FinanceReport>
  /** Лента запросов к модели: вопрос, ответ, картинки, цена. */
  requests(q: RequestsQuery, s: AdminSettings): Promise<RequestsPage>
  /** Файл картинки запроса (фото пользователя или генерация) или null. */
  image(id: string): Promise<{ mime: string; data: Buffer } | null>
}

export function demoRepo(): AdminRepo {
  let ds = buildDataset()
  let feed = demoRequests(ds)
  // данные «живые»: раз в час пересчитываем относительно текущего времени
  const fresh = () => {
    if (Date.now() - ds.now > 3_600_000) {
      ds = buildDataset()
      feed = demoRequests(ds)
    }
    return ds
  }
  return {
    overview: async (r, s) => overview(fresh(), r, s),
    analytics: async (r, s) => analyticsReport(fresh(), r, s),
    payments: async (r) => paymentsReport(fresh(), r),
    api: async (r, s) => apiReport(fresh(), r, s),
    images: async (r, s) => imagesReport(fresh(), r, s),
    users: async (q, s) => usersPage(fresh(), q, s),
    user: async (id, s) => userDetail(fresh(), id, s),
    finance: async (r, s) => financeReport(fresh(), r, s),
    requests: async (q, s) => {
      fresh()
      return requestsPageOf(feed, q, s)
    },
    image: async (id) => (isDemoImage(id) ? { mime: 'image/svg+xml', data: Buffer.from(DEMO_IMAGE_SVG) } : null),
  }
}

export interface SettingsStore {
  settings(): AdminSettings
  saveSettings(s: AdminSettings): void
}

/** Небольшое файловое хранилище: атомарная запись JSON, журнал - JSON Lines. */
export class FileStore implements SettingsStore {
  private dir: string
  private auditCache: AuditEntry[] = []

  constructor(dir: string) {
    this.dir = dir
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    try {
      const lines = readFileSync(join(dir, 'audit.jsonl'), 'utf8').trim().split('\n').slice(-200)
      this.auditCache = lines.filter(Boolean).map((l) => JSON.parse(l) as AuditEntry).reverse()
    } catch {
      /* журнала ещё нет */
    }
  }

  private read<T>(name: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(join(this.dir, name), 'utf8')) as T
    } catch {
      return fallback
    }
  }

  private write(name: string, value: unknown) {
    const file = join(this.dir, name)
    writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 })
    renameSync(`${file}.tmp`, file)
  }

  settings(): AdminSettings {
    return { ...defaultAdminSettings(), ...this.read<Partial<AdminSettings>>('settings.json', {}) }
  }
  saveSettings(s: AdminSettings) {
    this.write('settings.json', s)
  }

  /** Последний использованный шаг TOTP переживает перезапуск - повтор кода невозможен. */
  lastTotpStep(): number {
    return this.read<{ step: number }>('totp.json', { step: -1 }).step
  }
  setLastTotpStep(step: number) {
    this.write('totp.json', { step })
  }

  audit(entry: AuditEntry) {
    this.auditCache.unshift(entry)
    this.auditCache.length = Math.min(this.auditCache.length, 200)
    appendFileSync(join(this.dir, 'audit.jsonl'), `${JSON.stringify(entry)}\n`, { mode: 0o600 })
  }
  recentAudit(limit = 100) {
    return this.auditCache.slice(0, limit)
  }
}

/** Строки для fail2ban: фиксированный формат, IP - единственное переменное поле. */
export function authLogger(file: string) {
  try {
    mkdirSync(dirname(file), { recursive: true, mode: 0o750 })
  } catch {
    /* каталог создаёт установка; в dev пишем только в stderr */
  }
  return (event: 'ADMIN_AUTH_FAIL' | 'ADMIN_AUTH_LOCK' | 'ADMIN_AUTH_OK', ip: string) => {
    const line = `${new Date().toISOString()} ${event} ip=${ip}\n`
    process.stderr.write(line)
    try {
      appendFileSync(file, line, { mode: 0o640 })
    } catch {
      /* нет прав в dev - достаточно stderr/journald */
    }
  }
}
