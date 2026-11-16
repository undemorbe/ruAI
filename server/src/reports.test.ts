/**
 * Отчёты админки на боевой базе: выдачи из панели не считаются продажами, удалённые
 * пользователи не превращаются в одного «активного/платящего», точное время захода.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { PRICES } from '@/content/plans'
import { lastDays } from '../../src/admin/range.ts'
import { grantSubscription } from './api/billing.ts'
import { Db } from './api/db.ts'
import { ImageFiles } from './api/images.ts'
import { readSettings, reserve, settle } from './api/ledger.ts'
import { deleteUser } from './api/sweep.ts'
import { loadConfig } from './config.ts'
import { base32Decode } from './crypto.ts'
import { DEV_ADMIN_ORIGIN, DEV_ADMIN_PATH, DEV_TOTP_SECRET, devAdminEnv } from './devAdmin.ts'
import { sqlRepo } from './sqlRepo.ts'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-16T09:00:00Z')
const R30 = lastDays(30, NOW)
const A = 'u_aaaaaaaaaaaaaaaaaaaa'
const B = 'u_bbbbbbbbbbbbbbbbbbbb'
const C = 'u_cccccccccccccccccccc'

function seed() {
  const db = new Db(':memory:')
  const files = new ImageFiles(mkdtempSync(join(tmpdir(), 'ruai-reports-')))
  for (const [id, login] of [
    [A, 'alice'],
    [B, 'bob'],
    [C, 'carol'],
  ] as const) {
    db.run("INSERT INTO users (id, login, password_hash, created_at) VALUES (?, ?, 'scrypt$x', ?)", id, login, NOW - 20 * DAY)
  }
  const pay = (id: string, user: string, at: number) => {
    db.run(
      "INSERT INTO payments (id, user_id, provider, provider_id, tier, plan_id, amount, status, created_at, paid_at) VALUES (?, ?, 'fake', ?, 'text', 'month', ?, 'succeeded', ?, ?)",
      id,
      user,
      id,
      PRICES.text.month,
      at,
      at,
    )
    db.run(
      "INSERT INTO subscriptions (id, user_id, payment_id, source, tier, plan_id, started_at, expires_at, total_limit, daily_limit, budget_rub) VALUES (?, ?, ?, 'payment', 'text', 'month', ?, ?, 1500, 200, 395)",
      `sub_${id}`,
      user,
      id,
      at,
      at + 30 * DAY,
    )
  }
  const use = (user: string, at: number, cost: number) => {
    const r = reserve(db, { userId: user, kind: 'text', model: 'm', now: at, dailyUsdCap: 100 })
    settle(db, r.eventId, { produced: true, tokensIn: 10, tokensOut: 10, costUsd: cost })
  }
  pay('pay_a', A, NOW - 5 * DAY)
  pay('pay_b', B, NOW - 4 * DAY)
  use(A, NOW - 3 * DAY, 0.5)
  use(B, NOW - 3 * DAY + 60_000, 0.25)
  // C получил подписку из панели (0 ₽) и пользовался ею
  grantSubscription(db, { userId: C, tier: 'media', planId: 'week', now: NOW - 2 * DAY })
  use(C, NOW - DAY, 0.1)
  return { db, files, repo: sqlRepo(db, files, () => NOW) }
}

test('выдача подписки из панели не считается продажей, но видна в списке и в активных подписках', async () => {
  const { db, repo } = seed()
  const s = readSettings(db)
  const p = await repo.payments(R30)
  assert.equal(p.succeeded.count, 2, 'продажи - только оплаченные')
  assert.equal(p.first.count, 2)
  assert.equal(p.byPlan.reduce((n, x) => n + x.count, 0), 2)
  assert.equal(p.byPlan.find((x) => x.tier === 'media' && x.planId === 'week')!.count, 0)
  assert.ok(p.recent.some((x) => x.userId === C && x.amount === 0), 'выдача остаётся в «Последних платежах»')
  const o = await repo.overview(R30, s)
  assert.equal(o.newSubscriptions, 2)
  assert.equal(o.activeSubscriptions, 3)
  const f = await repo.finance(R30, s)
  assert.equal(f.payingUsers, 2)
  assert.equal(f.avgCheckRub, PRICES.text.month)
})

test('удалённые пользователи: деньги и расходы в суммах, но не «активный/платящий пользователь»', async () => {
  const { db, files, repo } = seed()
  const s = readSettings(db)
  const before = await repo.overview(R30, s)
  assert.equal(before.activeUsers, 3)
  assert.ok(await deleteUser(db, files, A))
  assert.ok(await deleteUser(db, files, B))

  const o = await repo.overview(R30, s)
  assert.equal(o.revenueRub, before.revenueRub, 'выручка не пропадает')
  assert.equal(o.requests, before.requests, 'запросы не пропадают')
  assert.equal(o.openrouterUsd, before.openrouterUsd)
  assert.equal(o.activeUsers, 1, 'двое удалённых не превращаются в одного активного')

  const a = await repo.analytics(R30, s)
  assert.equal(a.activity.activeUsers, 1)
  assert.equal(Math.max(...a.days.map((d) => d.activeUsers)), 1)
  assert.equal(a.payback.payingUsers, 0, 'удалённые не считаются платящим пользователем')

  const api = await repo.api(R30, s)
  assert.deepEqual(
    api.topUsers.map((u) => u.userId),
    [C],
    'в топе только существующие пользователи: карточку удалённого открыть нельзя',
  )
  const f = await repo.finance(R30, s)
  assert.equal(f.revenueRub, 2 * PRICES.text.month)
  assert.equal(f.payingUsers, 0)
  assert.equal(f.arpuRub, 0)
  const p = await repo.payments(R30)
  assert.equal(p.succeeded.count, 2)
  assert.ok(p.recent.filter((x) => x.amount > 0).every((x) => x.userId === 'deleted' && x.login === 'удалён'))
})

test('последняя активность - точное время захода, а не начало суток последнего запроса', async () => {
  const { db, repo } = seed()
  const s = readSettings(db)
  const seen = NOW - DAY + 5 * 3_600_000
  db.run('UPDATE users SET last_active_at = ? WHERE id = ?', seen, C)
  const page = await repo.users({ q: 'carol' }, s)
  assert.equal(page.items[0]!.lastActiveAt, new Date(seen).toISOString())
  // без отметки входа - день последнего запроса
  const bob = (await repo.users({ q: 'bob' }, s)).items[0]!
  assert.equal(bob.lastActiveAt, new Date(Math.floor((NOW - 3 * DAY) / DAY) * DAY).toISOString())
  // сортировка «по активности» учитывает точное время
  const active = await repo.users({ sort: 'active' }, s)
  assert.equal(active.items[0]!.login, 'carol')
})

test('dev-админка на локальной базе: конфиг проходит проверку и годится только для localhost', () => {
  const env = devAdminEnv({}, 'scrypt$dev')
  const cfg = loadConfig(env)
  assert.equal(cfg.adminPath, DEV_ADMIN_PATH)
  assert.equal(cfg.origin, DEV_ADMIN_ORIGIN)
  assert.equal(cfg.host, '127.0.0.1')
  assert.equal(cfg.insecureCookie, true)
  assert.equal(cfg.demo, false, 'отчёты из базы, не демо')
  assert.equal(cfg.dbFile, '.data/ruai.db')
  assert.equal(loadConfig(devAdminEnv({ RUAI_DB: '/tmp/x.db' }, 'scrypt$dev')).dbFile, '/tmp/x.db')
  assert.ok(base32Decode(DEV_TOTP_SECRET).length >= 16)
  assert.throws(() => devAdminEnv({ NODE_ENV: 'production' }, 'scrypt$dev'), /production/)
  // http-origin не на localhost конфиг админки не принимает - dev-значения не вынести наружу
  assert.throws(() => loadConfig({ ...env, ADMIN_ORIGIN: 'http://ru-chatgpt.com' }), /ADMIN_ORIGIN/)
})

test('у каждого кода ошибки, который пишет API сайта, есть подпись в админке', async () => {
  const { readdirSync, readFileSync } = await import('node:fs')
  const { ERROR_LABEL } = await import('../../src/admin/format.ts')
  const dir = join(import.meta.dirname, 'api')
  const codes = new Set<string>()
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/errorCode(?:\s*=(?!=)|:)\s*([^\n,}]+)/g)) {
      // значения присваивания, без сравнений вида kind === 'image'
      for (const s of m[1]!.replace(/[!=]==\s*'[a-z_]+'/g, '').matchAll(/'([a-z_]+)'/g)) codes.add(s[1]!)
    }
  }
  // прерванные пользователем запросы в отчёт ошибок не попадают (sqlRepo)
  codes.delete('aborted')
  for (const c of ['upstream', 'empty', 'no_image', 'internal', 'interrupted']) assert.ok(codes.has(c), `код ${c} найден в исходниках`)
  for (const c of codes) assert.ok(ERROR_LABEL[c], `нет подписи для ${c}`)
})
