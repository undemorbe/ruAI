import { analyticsReport, userDetail } from '../demo/analytics'
import { apiReport, buildDataset, currentSub, DEMO_PLANS, defaultAdminSettings, financeReport, imagesReport, overview, paymentsReport, usersPage } from '../demo/dataset'
import { checkSubEdit, checkUserEdit, cleanNote, expiryOf } from '../edits'
import { DAY } from '../range'
import type { AdminService } from './contract'
import { AdminError } from './http'
import type { AdminSettings, AuditEntry } from './types'

/**
 * Мок админки для локальной разработки (`npm run dev:admin`). Вход: admin / demo / 000000.
 * Настройки пишутся в тот же localStorage, что читает мок чата, - переключатель генерации
 * и лимиты действуют в мок-чате, когда админка и сайт открыты на одном origin (в проде - общий сервер).
 * Правки пользователей меняют демо-данные в памяти - до перезагрузки страницы.
 */
const SETTINGS_KEY = 'ruai.mock.admin.settings'
const SESSION_KEY = 'ruai.mock.admin.session'
const ds = buildDataset()
const audit: AuditEntry[] = []
/** Демо-приглашение: #/invite/demo-invite-token-0000000000 (код 000000). */
const MOCK_INVITE = 'demo-invite-token-0000000000'
const invited = new Map<string, string>()
const wait = (ms = 180) => new Promise((r) => setTimeout(r, ms))
const log = (action: AuditEntry['action'], detail?: string) => audit.unshift({ at: new Date().toISOString(), ip: '127.0.0.1', action, detail })

function loadSettings(): AdminSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaultAdminSettings(), ...JSON.parse(raw) }
  } catch {
    /* повреждённые данные - берём значения по умолчанию */
  }
  return defaultAdminSettings()
}

function session() {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  const s = JSON.parse(raw)
  return Date.parse(s.expiresAt) > Date.now() ? s : null
}
async function guarded<T>(fn: () => T, ms?: number): Promise<T> {
  await wait(ms)
  if (!session()) throw new AdminError('Сессия истекла, войдите снова', 401)
  return fn()
}
const userOf = (id: string) => {
  const u = ds.users.find((x) => x.id === id)
  if (!u) throw new AdminError('Пользователь не найден', 404)
  return u
}

export const mockAdmin: AdminService = {
  async session() {
    await wait(60)
    return session()
  },
  async login({ login, password, code }) {
    await wait(400)
    const ok = code === '000000' && ((login === 'admin' && password === 'demo') || invited.get(login) === password)
    if (!ok) {
      log('login_failed', login)
      throw new AdminError('Неверный логин, пароль или код', 401)
    }
    const s = { login, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), demo: true }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
    log('login', login)
    return s
  },
  async logout() {
    sessionStorage.removeItem(SESSION_KEY)
    log('logout')
  },
  async inviteInfo(token) {
    await wait(120)
    if (token !== MOCK_INVITE || invited.has('newadmin')) throw new AdminError('Ссылка недействительна или истекла', 404)
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
    return { login: 'newadmin', secret, uri: `otpauth://totp/ruAI%20admin%3Anewadmin?secret=${secret}&issuer=ruAI%20admin`, expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString() }
  },
  async acceptInvite({ token, password, code }) {
    const { login } = await mockAdmin.inviteInfo(token)
    if (password.length < 14) throw new AdminError('Пароль - не короче 14 символов', 400)
    if (code !== '000000') throw new AdminError('Неверный код из приложения', 400)
    invited.set(login, password)
    log('admin_added', login)
    return { login }
  },
  overview: (r) => guarded(() => overview(ds, r, loadSettings())),
  analytics: (r) => guarded(() => analyticsReport(ds, r, loadSettings()), 260),
  payments: (r) => guarded(() => paymentsReport(ds, r)),
  api: (r) => guarded(() => apiReport(ds, r, loadSettings())),
  images: (r) => guarded(() => imagesReport(ds, r, loadSettings())),
  users: (q) => guarded(() => usersPage(ds, q, loadSettings())),
  finance: (r) => guarded(() => financeReport(ds, r, loadSettings())),
  settings: () => guarded(() => loadSettings(), 80),
  saveSettings: (s) =>
    guarded(() => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
      log('settings', `генерация ${s.generationEnabled ? 'вкл' : 'выкл'}`)
      return s
    }, 250),
  audit: () => guarded(() => audit.slice(0, 100), 80),
  user: (id) => guarded(() => userDetail(ds, userOf(id).id, loadSettings())!),
  grant: (userId, tier, planId) =>
    guarded(() => {
      userOf(userId)
      const now = Date.now()
      const cur = currentSub(ds, userId, now)
      const carry = cur ? Math.max(0, cur.expiresAt - now) : 0
      if (cur) cur.expiresAt = now
      ds.payments.push({ id: `grant-${now}`, userId, at: now, tier, planId, amount: 0, status: 'succeeded', refunded: false, repeat: false, autoRenew: false, provider: 'admin' })
      const p = DEMO_PLANS[planId]
      ds.subs.push({
        id: `s_admin_${now}`,
        userId,
        tier,
        planId,
        startAt: now,
        expiresAt: now + p.days * DAY + carry,
        autoRenew: false,
        source: 'admin',
        totalLimit: p.requests,
        totalUsed: 0,
        dailyLimit: p.perDay,
        dailyUsed: 0,
        genUsed: 0,
        budgetRub: loadSettings().budgetsRub[tier][planId],
        spentUsd: 0,
      })
      log('grant', `${userId} ${tier}/${planId}`)
    }, 200),
  editSubscription: (userId, e) =>
    guarded(() => {
      userOf(userId)
      const bad = checkSubEdit(e)
      if (bad) throw new AdminError(bad, 400)
      const sub = currentSub(ds, userId)
      if (!sub) throw new AdminError('Нет действующей подписки', 409)
      const now = Date.now()
      if (e.end) sub.expiresAt = now
      if (e.expiresOn) sub.expiresAt = expiryOf(e.expiresOn)
      if (e.totalLimitDelta) sub.totalLimit = Math.max(sub.totalUsed ?? 0, (sub.totalLimit ?? DEMO_PLANS[sub.planId].requests) + e.totalLimitDelta)
      if (e.budgetDeltaRub) sub.budgetRub = Math.max(0, (sub.budgetRub ?? 0) + e.budgetDeltaRub)
      if (e.autoRenew !== undefined) sub.autoRenew = e.autoRenew
      if (e.resetDaily) sub.dailyUsed = 0
      log('edit_sub', `${userId} ${Object.keys(e).join(',')}`)
    }, 200),
  editUser: (userId, e) =>
    guarded(() => {
      const u = userOf(userId)
      const bad = checkUserEdit(e)
      if (bad) throw new AdminError(bad, 400)
      if (e.email !== undefined) {
        // email только для чеков: во входе не участвует, уникальность и сессии не трогаем
        u.email = e.email.trim().toLowerCase()
      }
      if (e.note !== undefined) u.note = cleanNote(e.note)
      log('edit_user', `${userId} ${Object.keys(e).join(',')}`)
    }, 200),
  logoutUser: (userId) =>
    guarded(() => {
      userOf(userId).sessions = 0
      log('logout_user', userId)
    }, 150),
  setBlocked: (userId, blocked) =>
    guarded(() => {
      const u = userOf(userId)
      u.blocked = blocked
      if (blocked) u.sessions = 0
      log(blocked ? 'block' : 'unblock', userId)
    }, 150),
  removeUser: (userId, login) =>
    guarded(() => {
      const u = userOf(userId)
      if (u.login !== login.trim().toLowerCase()) throw new AdminError('Логин не совпадает', 400)
      ds.users.splice(ds.users.indexOf(u), 1)
      log('delete_user', userId)
    }, 200),
}
