import { apiReport, buildDataset, defaultAdminSettings, financeReport, imagesReport, overview, paymentsReport, usersPage } from '../demo/dataset'
import type { AdminService } from './contract'
import { AdminError } from './http'
import type { AdminSettings, AuditEntry } from './types'

/**
 * Мок админки для локальной разработки (`npm run dev:admin`). Вход: admin / demo / 000000.
 * Настройки пишутся в тот же localStorage, что читает мок чата, — переключатель генерации
 * и лимиты действуют в мок-чате, когда админка и сайт открыты на одном origin (в проде — общий сервер).
 */
const SETTINGS_KEY = 'ruai.mock.admin.settings'
const SESSION_KEY = 'ruai.mock.admin.session'
const ds = buildDataset()
const audit: AuditEntry[] = []
const wait = (ms = 180) => new Promise((r) => setTimeout(r, ms))
const log = (action: AuditEntry['action'], detail?: string) => audit.unshift({ at: new Date().toISOString(), ip: '127.0.0.1', action, detail })

function loadSettings(): AdminSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaultAdminSettings(), ...JSON.parse(raw) }
  } catch {
    /* повреждённые данные — берём значения по умолчанию */
  }
  return defaultAdminSettings()
}

function session() {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return null
  const s = JSON.parse(raw)
  return Date.parse(s.expiresAt) > Date.now() ? s : null
}
function guard() {
  if (!session()) throw new AdminError('Сессия истекла, войдите снова', 401)
}

export const mockAdmin: AdminService = {
  async session() {
    await wait(60)
    return session()
  },
  async login({ login, password, code }) {
    await wait(400)
    if (login !== 'admin' || password !== 'demo' || code !== '000000') {
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
  async overview(d) {
    await wait()
    guard()
    return overview(ds, d, loadSettings())
  },
  async payments(d) {
    await wait()
    guard()
    return paymentsReport(ds, d)
  },
  async api(d) {
    await wait()
    guard()
    return apiReport(ds, d, loadSettings())
  },
  async images(d) {
    await wait()
    guard()
    return imagesReport(ds, d, loadSettings())
  },
  async users(q) {
    await wait()
    guard()
    return usersPage(ds, q, loadSettings())
  },
  async finance(d) {
    await wait()
    guard()
    return financeReport(ds, d, loadSettings())
  },
  async settings() {
    await wait(80)
    guard()
    return loadSettings()
  },
  async saveSettings(s) {
    await wait(250)
    guard()
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
    log('settings', `генерация ${s.generationEnabled ? 'вкл' : 'выкл'}`)
    return s
  },
  async audit() {
    await wait(80)
    guard()
    return audit.slice(0, 100)
  },
}
