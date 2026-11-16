/** Общая обвязка тестов API: база в памяти, подделки Telegram и OpenRouter, управляемые часы. */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LEGAL_VERSION } from '@/content/legal/operator'
import { buildApiApp, type ApiDeps } from './app.ts'
import type { ApiConfig } from './config.ts'
import { Db } from './db.ts'
import { ImageFiles } from './images.ts'
import type { AgentChunk, AgentRequest, Llm, LlmChunk, LlmMessage } from './openrouter.ts'
import type { TgNotifier } from './tg/notify.ts'

export const ORIGIN = 'https://ru-chatgpt.test'

export const testConfig = (over: Partial<ApiConfig> = {}): ApiConfig => ({
  host: '127.0.0.1',
  port: 0,
  origin: ORIGIN,
  dbFile: ':memory:',
  imagesDir: '',
  pepper: 'p'.repeat(40),
  openrouterKey: 'sk-or-test-000000000000000000',
  models: { text: 'm/text', media: 'm/media', image: 'm/image' },
  dailyUsdCap: 30,
  tgToken: '123456789:' + 'T'.repeat(35),
  authLog: '/dev/null',
  insecureCookie: false,
  payments: 'none',
  freekassa: null,
  llmStub: false,
  ...over,
})

export interface FakeLlm extends Llm {
  calls: { model: string; messages: LlmMessage[]; api: 'chat' | 'responses'; instructions?: string; imageTool?: AgentRequest['imageTool']; forceImage?: boolean }[]
  /** Что вернёт следующий вызов stream (текстовый тариф). */
  script: LlmChunk[] | Error
  /** Что вернёт следующий вызов respond (расширенный тариф); null: тот же script. */
  agent: AgentChunk[] | Error | null
  /** Пауза между кусками (для проверки busy). */
  gate: Promise<void> | null
}

export function fakeLlm(): FakeLlm {
  const f: FakeLlm = {
    calls: [],
    script: [
      { type: 'text', text: 'Привет' },
      { type: 'text', text: ', мир' },
      { type: 'end', finish: 'stop', usage: { tokensIn: 100, tokensOut: 20, costUsd: 0.001 } },
    ],
    agent: null,
    gate: null,
    async *stream(req) {
      f.calls.push({ model: req.model, messages: req.messages, api: 'chat' })
      if (f.script instanceof Error) throw f.script
      for (const ch of f.script) {
        if (f.gate) await f.gate
        yield ch
      }
    },
    async *respond(req) {
      f.calls.push({ model: req.model, messages: req.messages, api: 'responses', instructions: req.instructions, imageTool: req.imageTool, forceImage: req.forceImage })
      const script = f.agent ?? f.script
      if (script instanceof Error) throw script
      for (const ch of script) {
        if (f.gate) await f.gate
        yield ch
      }
    },
  }
  return f
}

export interface FakeTg extends TgNotifier {
  sent: { tgId: number; kind: 'login' | 'unlink' | 'reset' | 'notice'; ref?: string; code?: string; url?: string; text?: string }[]
  closed: { tgId: number; messageId: number; text: string }[]
  /** false: отправка «не удалась». */
  ok: boolean
}

export function fakeTg(): FakeTg {
  let mid = 100
  const t: FakeTg = {
    botName: 'test_auth_bot',
    sent: [],
    closed: [],
    ok: true,
    linkUrl: (token) => `https://t.me/test_auth_bot?start=${token}`,
    async loginPrompt(tgId, p) {
      if (!t.ok) return null
      t.sent.push({ tgId, kind: 'login', ref: p.ref, code: p.code })
      return ++mid
    },
    async unlinkPrompt(tgId, p) {
      if (!t.ok) return null
      t.sent.push({ tgId, kind: 'unlink', ref: p.ref })
      return ++mid
    },
    async resetLink(tgId, url) {
      if (!t.ok) return false
      t.sent.push({ tgId, kind: 'reset', url })
      return true
    },
    async notice(tgId, text) {
      t.sent.push({ tgId, kind: 'notice', text })
    },
    async close(tgId, messageId, text) {
      t.closed.push({ tgId, messageId, text })
    },
  }
  return t
}

export function setup(opts: { cfg?: Partial<ApiConfig>; deps?: Partial<ApiDeps> } = {}) {
  const db = new Db(':memory:')
  const dir = mkdtempSync(join(tmpdir(), 'ruai-img-'))
  const files = new ImageFiles(dir)
  const tg = fakeTg()
  const llm = fakeLlm()
  const clock = { t: Date.parse('2026-11-16T09:00:00Z') }
  const fails: string[] = []
  const app = buildApiApp(testConfig({ imagesDir: dir, ...opts.cfg }), {
    db,
    files,
    tg,
    llm,
    now: () => clock.t,
    authLog: (_e, ip) => fails.push(ip),
    ...opts.deps,
  })

  const H = { 'x-requested-with': 'ruai', origin: ORIGIN }
  let cookie = ''
  const req = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}) => {
    const r = await app.inject({ method, url, headers: { ...H, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, ...(body !== undefined ? { payload: JSON.stringify(body) } : {}) })
    const set = r.headers['set-cookie']
    if (typeof set === 'string') cookie = set.split(';')[0]!.endsWith('=') ? '' : set.split(';')[0]!
    return r
  }

  const consent = { version: LEGAL_VERSION, terms: true, personalData: true }

  /** Регистрация: cookie сессии в `cookie`. Возвращает id пользователя. */
  async function register(login = 'boris', password = 'correct horse') {
    const r = await req('POST', '/api/auth/register', { login, password, consent })
    if (r.statusCode !== 200) throw new Error(`register ${r.statusCode} ${r.body}`)
    return (r.json() as { user: { id: string } }).user.id
  }

  /** Привязать Telegram напрямую в БД (сам бот проверяется в tg/bot.test.ts). */
  function linkTg(userId: string, tgId = 4242) {
    db.run('UPDATE users SET tg_id = ?, tg_linked_at = ? WHERE id = ?', tgId, clock.t, userId)
  }

  const logout = () => req('POST', '/api/auth/logout')

  const flush = () => new Promise((r) => setImmediate(r))

  /** Разбор SSE-ответа в события. */
  const events = (body: string) =>
    body
      .split('\n\n')
      .filter((c) => c.startsWith('data:'))
      .map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- события разных форм, тесты читают нужные поля
        (c) => JSON.parse(c.slice(5).trim()) as any,
      )

  return {
    app,
    auth: app.auth,
    db,
    files,
    tg,
    llm,
    clock,
    fails,
    req,
    register,
    linkTg,
    logout,
    consent,
    events,
    flush,
    get cookie() {
      return cookie
    },
    set cookie(v: string) {
      cookie = v
    },
  }
}
