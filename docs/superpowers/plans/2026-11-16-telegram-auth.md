# Вход по логину и паролю с Telegram-2FA: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** заменить вход по коду из письма на логин и пароль; Telegram-бот подтверждает аккаунт, даёт 2FA и восстановление пароля; без Telegram сервисом можно пользоваться, но видна плашка «Аккаунт не защищён».

**Architecture:** бот живёт внутри процесса ruai-api (long polling `getUpdates`), пишет в ту же SQLite. `Auth` (server/src/api/auth.ts) отвечает за пароли, сессии и заявки 2FA; отправку в Telegram делает узкий `TgNotifier`, разбор апдейтов `TgBot`. Фронт ходит через `AuthService` (контракт), мок повторяет правила.

**Tech Stack:** Node 24 (TypeScript без сборки, `node --test`), Fastify 5, `node:sqlite`, `node:crypto` (scrypt), Vue 3 + Pinia, Vitest.

**Спека:** `docs/superpowers/specs/2026-11-16-telegram-auth-design.md`.

**Общие правила (из CLAUDE.md):**
- импорты в server/ с расширением `.ts`; фронтовые модули сервер берёт через `@/…` (хук `register.ts`);
- `removeAdditional: false` в Fastify не трогать;
- длинное тире «—» запрещено в новых текстах, комментариях и коммитах;
- проект не в git: вместо коммита шаг «Контрольная точка» (прогон проверок). Коммит только с согласия пользователя;
- проверка сервера: `cd server && npm test && npx tsc --noEmit`; сайта: `npm run lint && npm run typecheck && npm test && npm run build`.

---

## Карта файлов

| Файл | Что делает |
|---|---|
| `src/lib/auth.ts` (переписать) | правила логина и пароля, `CODE_LENGTH`, `safeNext`; общие для фронта, мока и сервера |
| `server/src/api/password.ts` (новый) | scrypt-хэш, проверка, фиктивный хэш |
| `server/src/api/db.ts` (миграция 3) | новая `users`, `tg_links`, `login_challenges`, `password_resets`, `payments.receipt_email` |
| `server/src/api/tg/api.ts` (новый) | `TgApi`: HTTP-клиент Bot API и типы апдейтов |
| `server/src/api/tg/notify.ts` (новый) | `TgNotifier`: тексты и кнопки сообщений бота |
| `server/src/api/tg/device.ts` (новый) | «Chrome, macOS» из User-Agent |
| `server/src/api/tg/bot.ts` (новый) | `TgBot.handle(update)`: `/start <token>`, `/status`, кнопки |
| `server/src/api/tg/poll.ts` (новый) | цикл `getUpdates` с offset в `meta` |
| `server/src/api/auth.ts` (переписать) | регистрация, вход, 2FA, сброс, привязка, сессии, `view` |
| `server/src/api/app.ts` | новые маршруты, удаление `/auth/code`, `/auth/verify`; checkout с `email` |
| `server/src/api/billing.ts` | `receipt_email` в платеже |
| `server/src/api/config.ts`, `setup.ts`, `scripts/api-setup.ts`, `main.ts` | `TG_BOT_TOKEN`, SMTP больше не нужен |
| `server/src/api/mailer.ts` | удалить; `nodemailer` из зависимостей убрать |
| `server/src/api/sweep.ts` | чистка новых таблиц |
| `server/src/api/testkit.ts` | `fakeTg`, хелперы `register`/`login` |
| `src/api/types.ts`, `services/contracts.ts`, `services/http.ts`, `mocks/index.ts` | новый `AuthService` |
| `src/stores/user.ts` | `register`, `login`, `finishChallenge`, `refresh` |
| `src/pages/AuthPage.vue` (переписать) | вход, регистрация, ожидание 2FA, «Забыли пароль?» |
| `src/pages/ResetPage.vue` (новый) | новый пароль по ссылке из бота |
| `src/pages/AccountPage.vue` (новый) | «Безопасность»: Telegram, смена пароля |
| `src/components/ui/TelegramLinkDialog.vue` (новый) | ссылка на бота, ожидание привязки |
| `src/components/ui/UnprotectedBanner.vue` (новый) | плашка `compact` / `block` / `inline` |
| `src/router/index.ts` | `/reset`, `/account` |
| `ChatPage.vue`, `CheckoutPage.vue`, `PaywallDialog.vue`, `PaymentResultPage.vue`, `AuthDialog.vue`, `AppHeader.vue`, `ChatSidebar.vue` | плашка, тексты, email в оплате, ссылка на аккаунт |
| `src/admin/**`, `server/src/sqlRepo.ts` | логин вместо email, колонка Telegram |
| `src/content/legal/docs.ts`, `operator.ts` | состав ПДн, новая версия документов |
| `deploy/nginx/ruai.conf` | лимиты на новые адреса |

---

### Task 1: Общие правила логина и пароля

**Files:**
- Modify: `src/lib/auth.ts`
- Test: `src/lib/__tests__/auth.spec.ts`

- [ ] **Step 1: Переписать тест**

Заменить содержимое `src/lib/__tests__/auth.spec.ts` (тесты `safeNext` из старого файла перенести без изменений в конец):

```ts
import { describe, expect, it } from 'vitest'
import { CODE_LENGTH, cleanCode, isCode, isEmail, loginError, normalizeLogin, passwordError } from '../auth'

describe('логин', () => {
  it('нормализуется к нижнему регистру без пробелов по краям', () => {
    expect(normalizeLogin('  Boris_01 ')).toBe('boris_01')
  })
  it('правила: 3-32 символа a-z 0-9 _ . -, начало с буквы или цифры', () => {
    expect(loginError('bo')).toMatch(/от 3/)
    expect(loginError('a'.repeat(33))).toMatch(/до 32/)
    expect(loginError('_boris')).toMatch(/букв/)
    expect(loginError('борис')).toMatch(/латиниц/)
    expect(loginError('bo ris')).toMatch(/латиниц/)
    expect(loginError('boris.k-1_')).toBeNull()
  })
  it('служебные логины заняты', () => {
    for (const l of ['admin', 'Support', 'root', 'ruai', 'chatgpt', 'system']) expect(loginError(l)).toMatch(/занят/)
  })
})

describe('пароль', () => {
  it('8-128 символов и не совпадает с логином', () => {
    expect(passwordError('1234567', 'boris')).toMatch(/не короче 8/)
    expect(passwordError('x'.repeat(129), 'boris')).toMatch(/не длиннее 128/)
    expect(passwordError('Boris123', 'boris123')).toMatch(/логин/)
    expect(passwordError('correct horse', 'boris')).toBeNull()
  })
})

describe('код 2FA и email', () => {
  it('6 цифр', () => {
    expect(CODE_LENGTH).toBe(6)
    expect(cleanCode('48 29-13x')).toBe('482913')
    expect(isCode('482913')).toBe(true)
    expect(isCode('48291')).toBe(false)
  })
  it('email для чека', () => {
    expect(isEmail('a@b.ru')).toBe(true)
    expect(isEmail('a@b')).toBe(false)
  })
})
```

- [ ] **Step 2: Запустить, убедиться, что падает**

Run: `npx vitest run src/lib/__tests__/auth.spec.ts`
Expected: FAIL, `loginError is not a function` (или не экспортирован).

- [ ] **Step 3: Реализовать**

Заменить `src/lib/auth.ts` (функции `isEmail`, `normalizeEmail`, `safeNext` оставить как есть, удалить `RESEND_SECONDS`, `CODE_TTL_MIN`, `CODE_MAX_ATTEMPTS`):

```ts
/** Правила входа: логин и пароль, код 2FA из Telegram. Общие для экранов, мока и сервера. */

export const LOGIN_MIN = 3
export const LOGIN_MAX = 32
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128
export const CODE_LENGTH = 6
const RESERVED = new Set(['admin', 'support', 'root', 'ruai', 'chatgpt', 'system'])

export const normalizeLogin = (raw: string) => raw.trim().toLowerCase()

/** Текст ошибки для поля «Логин» или null. */
export function loginError(raw: string): string | null {
  const l = normalizeLogin(raw)
  if (l.length < LOGIN_MIN) return `Логин: от ${LOGIN_MIN} символов`
  if (l.length > LOGIN_MAX) return `Логин: до ${LOGIN_MAX} символов`
  if (!/^[a-z0-9._-]+$/.test(l)) return 'Логин: латиница, цифры, точка, дефис, подчёркивание'
  if (!/^[a-z0-9]/.test(l)) return 'Логин начинается с буквы или цифры'
  if (RESERVED.has(l)) return 'Этот логин занят'
  return null
}

/** Текст ошибки для поля «Пароль» или null. */
export function passwordError(password: string, login: string): string | null {
  if (password.length < PASSWORD_MIN) return `Пароль не короче ${PASSWORD_MIN} символов`
  if (password.length > PASSWORD_MAX) return `Пароль не длиннее ${PASSWORD_MAX} символов`
  if (normalizeLogin(password) === normalizeLogin(login)) return 'Пароль не должен совпадать с логином'
  return null
}

export const cleanCode = (raw: string) => raw.replace(/\D/g, '').slice(0, CODE_LENGTH)
export const isCode = (raw: string) => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(raw)

// isEmail, normalizeEmail, safeNext: без изменений (перенести из старого файла)
```

- [ ] **Step 4: Запустить тест**

Run: `npx vitest run src/lib/__tests__/auth.spec.ts`
Expected: PASS. Остальной сайт пока не собирается (старые импорты): это чинят задачи 12-14.

---

### Task 2: Хэш пароля

**Files:**
- Create: `server/src/api/password.ts`
- Test: `server/src/api/password.test.ts`

- [ ] **Step 1: Тест**

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.ts'

test('scrypt: верный пароль проходит, неверный нет, соль разная', async () => {
  const a = await hashPassword('correct horse')
  const b = await hashPassword('correct horse')
  assert.match(a, /^scrypt\$32768\$8\$1\$[\w-]{22}\$[\w-]{43}$/)
  assert.notEqual(a, b)
  assert.equal(await verifyPassword('correct horse', a), true)
  assert.equal(await verifyPassword('correct hors', a), false)
})

test('битый и «!»-хэш никогда не проходят, фиктивный хэш тоже', async () => {
  assert.equal(await verifyPassword('x', '!'), false)
  assert.equal(await verifyPassword('x', 'scrypt$1$1$1$a$b'), false)
  assert.equal(await verifyPassword('anything', DUMMY_HASH), false)
})
```

- [ ] **Step 2: Запустить, падает**

Run: `cd server && node --import ./src/register.ts --test src/api/password.test.ts`
Expected: FAIL, `Cannot find module './password.ts'`.

- [ ] **Step 3: Реализация**

```ts
/**
 * Пароли: scrypt из node:crypto. Формат `scrypt$N$r$p$salt$hash` (base64url), параметры в строке,
 * чтобы их можно было поднять без миграции. «!» - недействительный хэш (вход только после сброса).
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const N = 32768
const R = 8
const P = 1
const KEYLEN = 32
const MAXMEM = 64 * 1024 * 1024

const scrypt = (pw: string, salt: Buffer, opt: ScryptOptions) =>
  new Promise<Buffer>((ok, fail) => scryptCb(pw.normalize('NFKC'), salt, KEYLEN, opt, (e, k) => (e ? fail(e) : ok(k))))

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(pw, salt, { N, r: R, p: P, maxmem: MAXMEM })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([\w-]+)\$([\w-]+)$/.exec(stored)
  if (!m) return false
  const [n, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])]
  // чужие параметры (подмена строки в БД) не должны съесть память или CPU
  if (n !== N || r !== R || p !== P) return false
  const want = Buffer.from(m[5]!, 'base64url')
  if (want.length !== KEYLEN) return false
  const got = await scrypt(pw, Buffer.from(m[4]!, 'base64url'), { N: n, r, p, maxmem: MAXMEM })
  return timingSafeEqual(got, want)
}

/** Для несуществующего логина: столько же работы, ответ всегда false. */
export const DUMMY_HASH = `scrypt$${N}$${R}$${P}$${'A'.repeat(22)}$${'A'.repeat(43)}`
```

- [ ] **Step 4: Тест проходит**

Run: `cd server && node --import ./src/register.ts --test src/api/password.test.ts`
Expected: PASS (2 теста).

---

### Task 3: Миграция 3

**Files:**
- Modify: `server/src/api/db.ts` (массив `MIGRATIONS`, после миграции 2)
- Test: `server/src/api/db.test.ts` (новый)

- [ ] **Step 1: Тест**

```ts
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { Db, MIGRATIONS } from './db.ts'

test('миграция 3: users с логином, старые строки без пароля, auth_codes удалена', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ruai-m3-')), 'db.sqlite')
  // база версии 2 с двумя пользователями с одинаковой частью до @
  const raw = new DatabaseSync(file)
  raw.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  raw.exec(MIGRATIONS[0]!)
  raw.exec(MIGRATIONS[1]!)
  raw.exec("INSERT INTO meta VALUES ('schema', '2')")
  raw.exec("INSERT INTO users (id, email, created_at) VALUES ('u_1', 'Boris@a.ru', 1), ('u_2', 'boris@b.ru', 2)")
  raw.exec("INSERT INTO chats (id, user_id, title, created_at, updated_at) VALUES ('c_1', 'u_2', 't', 1, 1)")
  raw.close()

  const db = new Db(file)
  const rows = db.all<{ id: string; login: string; email: string; password_hash: string; tg_id: number | null }>('SELECT id, login, email, password_hash, tg_id FROM users ORDER BY id').map((r) => ({ ...r }))
  assert.deepEqual(rows, [
    { id: 'u_1', login: 'boris', email: 'Boris@a.ru', password_hash: '!', tg_id: null },
    { id: 'u_2', login: 'boris_u_2', email: 'boris@b.ru', password_hash: '!', tg_id: null },
  ])
  assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM chats')!.n, 1, 'внешние ключи пережили пересоздание')
  assert.equal(db.get("SELECT name FROM sqlite_master WHERE name = 'auth_codes'"), undefined)
  for (const t of ['tg_links', 'login_challenges', 'password_resets']) assert.ok(db.get('SELECT name FROM sqlite_master WHERE name = ?', t), t)
  assert.ok(db.all('PRAGMA table_info(payments)').some((c) => c.name === 'receipt_email'))
  db.close()
})
```

`MIGRATIONS` нужно экспортировать (`export const MIGRATIONS = [...]`).

- [ ] **Step 2: Запустить, падает**

Run: `cd server && node --import ./src/register.ts --test src/api/db.test.ts`
Expected: FAIL (`MIGRATIONS` не экспортирован или нет колонки `login`).

- [ ] **Step 3: Миграция**

В `db.ts`: `const MIGRATIONS` → `export const MIGRATIONS`; дописать третьим элементом. `PRAGMA foreign_keys` внутри транзакции не меняется, поэтому `migrate()` для этой версии выключает его до транзакции: в цикле `migrate()` перед `this.tx(...)` добавить `if (v === 2) this.sql.exec('PRAGMA foreign_keys = OFF')`, после `this.tx(...)` добавить `if (v === 2) this.sql.exec('PRAGMA foreign_keys = ON')`.

```ts
  // 3: вход по логину и паролю, Telegram-2FA. users пересоздаётся (у SQLite нельзя снять NOT NULL с email).
  `
  CREATE TABLE users_new (
    id TEXT PRIMARY KEY,
    login TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email TEXT,
    tg_id INTEGER UNIQUE,
    tg_linked_at INTEGER,
    admin_note TEXT,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER,
    blocked_at INTEGER
  );
  INSERT INTO users_new (id, login, password_hash, email, admin_note, created_at, last_active_at, blocked_at)
    SELECT u.id,
      CASE WHEN EXISTS (SELECT 1 FROM users o WHERE lower(substr(o.email, 1, instr(o.email, '@') - 1)) = lower(substr(u.email, 1, instr(u.email, '@') - 1)) AND o.created_at < u.created_at)
        THEN lower(substr(u.email, 1, instr(u.email, '@') - 1)) || '_' || lower(u.id)
        ELSE lower(substr(u.email, 1, instr(u.email, '@') - 1)) END,
      '!', u.email, u.admin_note, u.created_at, u.last_active_at, u.blocked_at
    FROM users u;
  DROP TABLE users;
  ALTER TABLE users_new RENAME TO users;
  DROP TABLE auth_codes;
  CREATE TABLE tg_links (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE login_challenges (
    id TEXT PRIMARY KEY,
    ref TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    ip TEXT NOT NULL,
    ua TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    tg_message_id INTEGER,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX login_challenges_user ON login_challenges(user_id);
  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  );
  ALTER TABLE payments ADD COLUMN receipt_email TEXT;
  `,
```

Логин вида `boris_u_2` длиннее 32 символов у очень длинных id не бывает (id: `u_` + 20 символов), но такие строки и так нужны только dev-базам: войти можно лишь после сброса.

- [ ] **Step 4: Тест проходит, старые тесты сервера**

Run: `cd server && node --import ./src/register.ts --test src/api/db.test.ts`
Expected: PASS. Полный `npm test` пока падает (auth.ts пишет `email`): чинит задача 7.

---

### Task 4: Клиент Bot API

**Files:**
- Create: `server/src/api/tg/api.ts`
- Test: `server/src/api/tg/api.test.ts`

- [ ] **Step 1: Тест (fetch подменяется)**

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { httpTgApi, TgError } from './api.ts'

test('запрос идёт POST JSON на метод бота, ответ разворачивается из result', async () => {
  const calls: { url: string; body: unknown }[] = []
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 })
  }) as typeof fetch
  const tg = httpTgApi('123456:' + 'A'.repeat(35), f)
  const r = await tg.sendMessage(42, 'hi', [[{ text: 'Да', callback_data: 'ok:x' }]])
  assert.equal(r.message_id, 7)
  assert.equal(calls[0]!.url, `https://api.telegram.org/bot123456:${'A'.repeat(35)}/sendMessage`)
  assert.deepEqual(calls[0]!.body, { chat_id: 42, text: 'hi', reply_markup: { inline_keyboard: [[{ text: 'Да', callback_data: 'ok:x' }]] }, link_preview_options: { is_disabled: true } })
})

test('ошибка Telegram: TgError без токена в тексте', async () => {
  const f = (async () => new Response(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }), { status: 403 })) as typeof fetch
  const tg = httpTgApi('123456:' + 'B'.repeat(35), f)
  await assert.rejects(tg.sendMessage(1, 'x'), (e: unknown) => e instanceof TgError && e.status === 403 && !e.message.includes('BBBB'))
})
```

- [ ] **Step 2: Падает**

Run: `cd server && node --import ./src/register.ts --test src/api/tg/api.test.ts`
Expected: FAIL, модуля нет.

- [ ] **Step 3: Реализация**

```ts
/** Узкий клиент Telegram Bot API: только то, что нужно входу. Токен не попадает в ошибки и логи. */

export type TgButton = { text: string; callback_data: string } | { text: string; url: string }

export interface TgUpdate {
  update_id: number
  message?: { message_id: number; chat: { id: number; type: string }; from?: { id: number }; text?: string }
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { message_id: number; chat: { id: number } } }
}

export interface TgApi {
  getMe(): Promise<{ username: string }>
  deleteWebhook(): Promise<void>
  getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal): Promise<TgUpdate[]>
  sendMessage(chatId: number, text: string, buttons?: TgButton[][]): Promise<{ message_id: number }>
  editMessageText(chatId: number, messageId: number, text: string): Promise<void>
  answerCallbackQuery(id: string, text?: string): Promise<void>
}

export class TgError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function httpTgApi(token: string, f: typeof fetch = fetch): TgApi {
  const base = `https://api.telegram.org/bot${token}/`
  async function call<T>(method: string, body: object, signal?: AbortSignal): Promise<T> {
    let res: Response
    try {
      res = await f(base + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: signal ?? AbortSignal.timeout(15_000) })
    } catch (e) {
      // в тексте сетевой ошибки может быть URL с токеном: не пробрасываем его
      throw new TgError(0, `telegram ${method}: ${(e as Error).name}`)
    }
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number }
    if (!data.ok) throw new TgError(data.error_code ?? res.status, `telegram ${method}: ${String(data.description ?? res.status).slice(0, 200)}`)
    return data.result as T
  }
  const markup = (buttons?: TgButton[][]) => (buttons ? { reply_markup: { inline_keyboard: buttons } } : {})
  return {
    getMe: () => call('getMe', {}),
    deleteWebhook: () => call('deleteWebhook', { drop_pending_updates: false }),
    getUpdates: (offset, timeoutSec, signal) => call('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message', 'callback_query'] }, signal),
    sendMessage: (chatId, text, buttons) => call('sendMessage', { chat_id: chatId, text, ...markup(buttons), link_preview_options: { is_disabled: true } }),
    editMessageText: async (chatId, messageId, text) => {
      await call('editMessageText', { chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: [] } })
    },
    answerCallbackQuery: async (id, text) => {
      await call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) })
    },
  }
}
```

- [ ] **Step 4: Проходит**

Run: `cd server && node --import ./src/register.ts --test src/api/tg/api.test.ts`
Expected: PASS.

---

### Task 5: Устройство из User-Agent и тексты бота

**Files:**
- Create: `server/src/api/tg/device.ts`, `server/src/api/tg/notify.ts`
- Test: `server/src/api/tg/notify.test.ts`

- [ ] **Step 1: Тест**

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TgApi, TgButton } from './api.ts'
import { describeDevice } from './device.ts'
import { tgNotifier } from './notify.ts'

test('устройство: браузер и ОС из UA, мусор не попадает в текст', () => {
  assert.equal(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'), 'Chrome, macOS')
  assert.equal(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'), 'Safari, iOS')
  assert.equal(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0'), 'Edge, Windows')
  assert.equal(describeDevice('<script>alert(1)</script>'), 'неизвестное устройство')
})

test('заявка на вход: время МСК, код, две кнопки с ref', async () => {
  const sent: { chat: number; text: string; buttons?: TgButton[][] }[] = []
  const api = { sendMessage: async (chat: number, text: string, buttons?: TgButton[][]) => (sent.push({ chat, text, buttons }), { message_id: 5 }) } as unknown as TgApi
  const n = tgNotifier(api, 'ruchatgpt_auth_bot', 'https://ru-chatgpt.com')
  const id = await n.loginPrompt(42, { ref: 'r'.repeat(22), code: '482913', device: 'Chrome, macOS', at: Date.parse('2026-11-16T09:04:00Z') })
  assert.equal(id, 5)
  assert.match(sent[0]!.text, /Chrome, macOS · 16\.11, 12:04 МСК/)
  assert.match(sent[0]!.text, /Код: 482 913/)
  assert.deepEqual(sent[0]!.buttons, [[{ text: '✅ Подтвердить', callback_data: `ok:${'r'.repeat(22)}` }, { text: '⛔ Это не я', callback_data: `no:${'r'.repeat(22)}` }]])
  assert.equal(n.linkUrl('tok'), 'https://t.me/ruchatgpt_auth_bot?start=tok')
})
```

- [ ] **Step 2: Падает**

Run: `cd server && node --import ./src/register.ts --test src/api/tg/notify.test.ts`
Expected: FAIL, модулей нет.

- [ ] **Step 3: `device.ts`**

```ts
/** Короткое описание устройства для сообщения о входе: «Chrome, macOS». Только из белого списка. */
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/YaBrowser\//, 'Яндекс Браузер'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
]

export function describeDevice(ua: string): string {
  const b = BROWSERS.find(([re]) => re.test(ua))?.[1]
  const s = SYSTEMS.find(([re]) => re.test(ua))?.[1]
  if (!b && !s) return 'неизвестное устройство'
  return [b ?? 'браузер', s].filter(Boolean).join(', ')
}
```

- [ ] **Step 4: `notify.ts`**

```ts
/** Сообщения бота входа. Только отправка: разбор апдейтов в bot.ts. */
import type { TgApi } from './api.ts'

export interface TgNotifier {
  readonly botName: string
  linkUrl(token: string): string
  /** id сообщения или null, если отправить не удалось. */
  loginPrompt(tgId: number, p: { ref: string; code: string; device: string; at: number }): Promise<number | null>
  unlinkPrompt(tgId: number, p: { ref: string; at: number }): Promise<number | null>
  resetLink(tgId: number, url: string): Promise<boolean>
  notice(tgId: number, text: string): Promise<void>
  close(tgId: number, messageId: number, text: string): Promise<void>
}

const msk = (t: number) => new Date(t + 3 * 3_600_000).toISOString().replace(/^\d{4}-(\d\d)-(\d\d)T(\d\d:\d\d).*$/, '$2.$1, $3')
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`

export function tgNotifier(api: TgApi, botName: string, origin: string): TgNotifier {
  const send = async (chat: number, text: string, buttons?: Parameters<TgApi['sendMessage']>[2]) => {
    try {
      return (await api.sendMessage(chat, text, buttons)).message_id
    } catch (e) {
      process.stderr.write(`tg send failed: ${(e as Error).message}\n`)
      return null
    }
  }
  return {
    botName,
    linkUrl: (token) => `https://t.me/${botName}?start=${token}`,
    loginPrompt: (tgId, p) =>
      send(tgId, `Вход в ${new URL(origin).host}\n${p.device} · ${msk(p.at)} МСК\nКод: ${spaced(p.code)}\n\nЕсли это не вы, нажмите «Это не я» и смените пароль.`, [
        [
          { text: '✅ Подтвердить', callback_data: `ok:${p.ref}` },
          { text: '⛔ Это не я', callback_data: `no:${p.ref}` },
        ],
      ]),
    unlinkPrompt: (tgId, p) =>
      send(tgId, `Отключить защиту аккаунта через Telegram? Запрос ${msk(p.at)} МСК.`, [
        [
          { text: 'Отключить', callback_data: `ok:${p.ref}` },
          { text: 'Отмена', callback_data: `no:${p.ref}` },
        ],
      ]),
    resetLink: async (tgId, url) => (await send(tgId, 'Смена пароля. Ссылка действует 15 минут. Если вы не просили сменить пароль, ничего не делайте.', [[{ text: 'Сменить пароль', url }]])) !== null,
    notice: async (tgId, text) => {
      await send(tgId, text)
    },
    close: async (tgId, messageId, text) => {
      await api.editMessageText(tgId, messageId, text).catch(() => {})
    },
  }
}
```

- [ ] **Step 5: Проходит**

Run: `cd server && node --import ./src/register.ts --test src/api/tg/notify.test.ts`
Expected: PASS.

---

### Task 6: Обвязка тестов: фальшивый Telegram

**Files:**
- Modify: `server/src/api/testkit.ts`

- [ ] **Step 1: Добавить `fakeTg` и поменять `setup`**

В `testkit.ts`:
- убрать `mail` и `mailer`, `testConfig` без `mail`, с `tgToken: 'test'`;
- добавить:

```ts
import type { TgNotifier } from './tg/notify.ts'

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
```

- `setup(opts)`: создаёт `const tg = fakeTg()`, передаёт `tg` в deps (`tg: opts.deps?.tg === undefined ? tg : opts.deps.tg`), возвращает `tg`;
- заменить хелпер `register` на:

```ts
  const consent = { version: LEGAL_VERSION, terms: true, personalData: true }

  /** Регистрация: cookie сессии в `cookie`. Возвращает id пользователя. */
  async function register(login = 'boris', password = 'correct horse') {
    const r = await req('POST', '/api/auth/register', { login, password, consent })
    if (r.statusCode !== 200) throw new Error(`register ${r.statusCode} ${r.body}`)
    return (r.json() as { user: { id: string } }).user.id
  }

  /** Привязать Telegram напрямую в БД (бот проверяется отдельно в bot.test.ts). */
  function linkTg(userId: string, tgId = 4242) {
    db.run('UPDATE users SET tg_id = ?, tg_linked_at = ? WHERE id = ?', tgId, clock.t, userId)
  }

  const logout = () => req('POST', '/api/auth/logout')
```

и вернуть `tg`, `linkTg`, `logout` из `setup`.

`chat.test.ts`, `images.test.ts`, `billing.test.ts` используют `t.register()` без аргументов: сигнатура совместима.

- [ ] **Step 2: Контрольная точка**

Тесты запустятся после задачи 7 (testkit ссылается на новые deps).

---

### Task 7: Auth: регистрация, вход, сессии

**Files:**
- Modify: `server/src/api/auth.ts` (переписать), `server/src/api/app.ts` (маршруты входа)
- Test: `server/src/api/auth.test.ts` (переписать)

- [ ] **Step 1: Тесты регистрации и входа без Telegram**

Заменить `auth.test.ts`:

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setup } from './testkit.ts'

test('регистрация: сессия сразу, логин в нижнем регистре, пароль только хэшем, согласия записаны', async () => {
  const t = setup()
  const r = await t.req('POST', '/api/auth/register', { login: 'Boris', password: 'correct horse', consent: t.consent })
  assert.equal(r.statusCode, 200)
  const body = r.json()
  assert.equal(body.user.login, 'boris')
  assert.equal(body.user.telegram, false)
  assert.equal(body.user.tgEnabled, true)
  assert.equal(body.token, '')
  assert.match(t.cookie, /^__Host-ruai_s=/)
  const row = t.db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE login = ?', 'boris')!
  assert.match(row.password_hash, /^scrypt\$/)
  assert.equal(t.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM consents')!.n, 2)
  assert.equal((await t.req('GET', '/api/auth/me')).json().login, 'boris')
})

test('регистрация: плохой логин, слабый пароль, занятый логин, без согласий', async () => {
  const t = setup()
  const reg = (b: object) => t.req('POST', '/api/auth/register', { login: 'boris', password: 'correct horse', consent: t.consent, ...b })
  assert.equal((await reg({ login: 'ad' })).json().code, 'bad_login')
  assert.equal((await reg({ login: 'admin' })).json().code, 'bad_login')
  assert.equal((await reg({ password: 'short' })).json().code, 'weak_password')
  assert.equal((await reg({ consent: { ...t.consent, personalData: false } })).statusCode, 422)
  assert.equal((await reg({})).statusCode, 200)
  await t.logout()
  const dup = await reg({ login: 'BORIS' })
  assert.equal(dup.statusCode, 409)
  assert.equal(dup.json().code, 'login_taken')
})

test('вход: верный пароль даёт новую сессию, неверный и чужой логин дают один и тот же ответ', async () => {
  const t = setup()
  await t.register()
  await t.logout()
  const bad1 = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'wrong pass' })
  const bad2 = await t.req('POST', '/api/auth/login', { login: 'nobody', password: 'wrong pass' })
  assert.equal(bad1.statusCode, 401)
  assert.deepEqual(bad1.json(), bad2.json())
  assert.equal(bad1.json().code, 'bad_credentials')
  assert.equal(t.fails.length, 2, 'неудачи уходят в fail2ban-журнал')
  const ok = await t.req('POST', '/api/auth/login', { login: ' Boris ', password: 'correct horse' })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.json().user.login, 'boris')
})

test('вход: 5 неудач на логин за 15 минут, потом 429 даже с верным паролем; через 15 минут снова можно', async () => {
  const t = setup()
  await t.register()
  await t.logout()
  for (let i = 0; i < 5; i++) await t.req('POST', '/api/auth/login', { login: 'boris', password: 'wrong pass' }, { 'x-forwarded-for': `10.0.0.${i}` })
  const r = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  assert.equal(r.statusCode, 429)
  assert.ok(Number(r.headers['retry-after']) > 0)
  t.clock.t += 15 * 60_000
  assert.equal((await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })).statusCode, 200)
})

test('регистрация: 5 на IP в час', async () => {
  const t = setup()
  for (let i = 0; i < 5; i++) {
    assert.equal((await t.req('POST', '/api/auth/register', { login: `user${i}`, password: 'correct horse', consent: t.consent })).statusCode, 200)
    await t.logout()
  }
  assert.equal((await t.req('POST', '/api/auth/register', { login: 'user9', password: 'correct horse', consent: t.consent })).statusCode, 429)
})

test('заблокированный не входит, его сессия не работает', async () => {
  const t = setup()
  const id = await t.register()
  t.db.run('UPDATE users SET blocked_at = 1 WHERE id = ?', id)
  assert.equal((await t.req('GET', '/api/auth/me')).json().isGuest, true)
  const r = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  assert.equal(r.statusCode, 403)
  assert.equal(r.json().code, 'blocked')
})

test('смена пароля: нужен текущий, остальные сессии закрываются', async () => {
  const t = setup()
  await t.register()
  const first = t.cookie
  // вторая сессия из «другого браузера»: без cookie, иначе вход закроет первую сам
  t.cookie = ''
  await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  assert.equal((await t.req('GET', '/api/auth/me', undefined, { cookie: first })).json().isGuest, false, 'первая сессия жива до смены')
  assert.equal((await t.req('POST', '/api/auth/password', { current: 'nope nope', password: 'new password 1' })).statusCode, 401)
  assert.equal((await t.req('POST', '/api/auth/password', { current: 'correct horse', password: 'new password 1' })).statusCode, 204)
  assert.equal((await t.req('GET', '/api/auth/me', undefined, { cookie: first })).json().isGuest, true, 'другая сессия закрыта')
  assert.equal((await t.req('GET', '/api/auth/me')).json().isGuest, false, 'текущая осталась')
})

test('старых адресов входа по почте нет', async () => {
  const t = setup()
  assert.equal((await t.req('POST', '/api/auth/code', { email: 'a@b.ru', intent: 'login' })).statusCode, 404)
  assert.equal((await t.req('POST', '/api/auth/verify', { email: 'a@b.ru', code: '000000' })).statusCode, 404)
})
```

`x-forwarded-for` работает, потому что `trustProxy` содержит 127.0.0.1, а `inject` приходит с 127.0.0.1. Если в testkit `inject` даёт другой адрес, лимит на IP проверять через разные логины, а не заголовок.

- [ ] **Step 2: Падает**

Run: `cd server && node --import ./src/register.ts --test src/api/auth.test.ts`
Expected: FAIL (нет `/api/auth/register`).

- [ ] **Step 3: Переписать `auth.ts`**

Оставить без изменений: `SESSION_TTL`, `SESSION_REFRESH`, `MAX_SESSIONS`, класс `Window`, `AuthError`, `Client`, `consentOk`, `recordConsents`, методы `createSession` (убрать строку `DELETE FROM auth_codes …`), `touch`, `dropSession`. Удалить `findOrCreateUser`, `requestCode`, `verify`, `AUTH_LIMITS` старые, импорт `Mailer`.

Новые части:

```ts
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import type { RegisterConsent, User } from '@/api/types'
import { CODE_LENGTH, isCode, loginError, normalizeLogin, passwordError } from '@/lib/auth'
import { randomToken, sha256 } from '../crypto.ts'
import { newId, type Db } from './db.ts'
import { readSettings, subscriptionView } from './ledger.ts'
import { DUMMY_HASH, hashPassword, verifyPassword } from './password.ts'
import { describeDevice } from './tg/device.ts'
import type { TgNotifier } from './tg/notify.ts'

export const AUTH_LIMITS = {
  loginFailPerIp: { limit: 10, windowMs: 15 * 60_000 },
  loginFailPerLogin: { limit: 5, windowMs: 15 * 60_000 },
  registerPerIp: { limit: 5, windowMs: 3_600_000 },
  registerGlobal: { limit: 200, windowMs: 3_600_000 },
  resetPerLogin: { limit: 3, windowMs: 3_600_000 },
  resetPerIp: { limit: 10, windowMs: 3_600_000 },
  challengePerIp: { limit: 60, windowMs: 10 * 60_000 },
}
export const CHALLENGE_TTL = 5 * 60_000
export const UNLINK_TTL = 10 * 60_000
export const LINK_TTL = 10 * 60_000
export const RESET_TTL = 15 * 60_000
export const CHALLENGE_ATTEMPTS = 5

export interface UserRow {
  id: string
  login: string
  password_hash: string
  email: string | null
  tg_id: number | null
  created_at: number
  blocked_at: number | null
}

export const GUEST = (tgEnabled: boolean): User => ({ id: 'guest', login: null, email: null, name: 'Гость', isGuest: true, telegram: false, tgEnabled, subscription: null })

export type LoginOutcome = { user: UserRow } | { challenge: string; expiresAt: number; sent: boolean }

export class Auth {
  private db: Db
  private pepper: string
  private tg: TgNotifier | null
  private onFail: (ip: string) => void
  private fails = new Window()
  private regs = new Window()
  private resets = new Window()
  private polls = new Window()

  constructor(db: Db, pepper: string, tg: TgNotifier | null, onFail: (ip: string) => void = () => {}) {
    this.db = db
    this.pepper = pepper
    this.tg = tg
    this.onFail = onFail
  }

  get tgEnabled() {
    return this.tg !== null
  }

  private codeHash(id: string, code: string) {
    return createHmac('sha256', this.pepper).update(`${id}:${code}`).digest('hex')
  }
  private byLogin(login: string) {
    return this.db.get<UserRow>('SELECT * FROM users WHERE login = ?', normalizeLogin(login))
  }
  private limited(w: Window, key: string, l: { limit: number; windowMs: number }, now: number, text: string) {
    const wait = w.wait(key, l.limit, l.windowMs, now)
    if (wait) throw new AuthError(429, 'rate_limit', text, wait)
  }

  async register(raw: { login: string; password: string; consent: RegisterConsent }, client: Client, now: number): Promise<UserRow> {
    const login = normalizeLogin(raw.login)
    const le = loginError(login)
    if (le) throw new AuthError(400, 'bad_login', le)
    const pe = passwordError(raw.password, login)
    if (pe) throw new AuthError(400, 'weak_password', pe)
    if (!consentOk(raw.consent, ['terms', 'personalData'])) throw new AuthError(422, 'consent', 'Обновите страницу и примите документы заново')
    const L = AUTH_LIMITS
    this.limited(this.regs, `ip:${client.ip}`, L.registerPerIp, now, 'Слишком много регистраций. Попробуйте позже.')
    this.limited(this.regs, 'all', L.registerGlobal, now, 'Регистрация временно недоступна. Попробуйте позже.')
    if (this.byLogin(login)) throw new AuthError(409, 'login_taken', 'Этот логин занят')
    const hash = await hashPassword(raw.password)
    return this.db.tx(() => {
      // параллельная регистрация того же логина: UNIQUE в БД, второй получает «занят»
      if (this.byLogin(login)) throw new AuthError(409, 'login_taken', 'Этот логин занят')
      const id = newId('u')
      this.db.run('INSERT INTO users (id, login, password_hash, created_at) VALUES (?, ?, ?, ?)', id, login, hash, now)
      recordConsents(this.db, id, ['terms', 'personal_data'], raw.consent.version, client, now)
      this.regs.hit(`ip:${client.ip}`, now)
      this.regs.hit('all', now)
      return this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id)!
    })
  }

  async login(rawLogin: string, password: string, client: Client, now: number): Promise<LoginOutcome> {
    const login = normalizeLogin(rawLogin)
    const L = AUTH_LIMITS
    const text = 'Слишком много попыток входа. Попробуйте позже.'
    this.limited(this.fails, `ip:${client.ip}`, L.loginFailPerIp, now, text)
    this.limited(this.fails, `l:${login}`, L.loginFailPerLogin, now, text)
    const user = login.length <= 64 ? this.byLogin(login) : undefined
    // на неизвестный логин считаем scrypt так же: по времени ответа логин не узнать
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH)
    if (!user || !ok) {
      this.fails.hit(`ip:${client.ip}`, now)
      this.fails.hit(`l:${login}`, now)
      this.onFail(client.ip)
      throw new AuthError(401, 'bad_credentials', 'Неверный логин или пароль')
    }
    if (user.blocked_at) throw new AuthError(403, 'blocked', 'Аккаунт заблокирован. Напишите в поддержку.')
    if (user.tg_id === null || !this.tg) return { user }
    return this.openChallenge(user, 'login', client, now)
  }

  /** Заявка 2FA (вход или отвязка). `challenge` знает только этот браузер, `ref` уходит в кнопки бота. */
  private async openChallenge(user: UserRow, kind: 'login' | 'unlink', client: Client, now: number) {
    const secret = randomToken(16)
    const ref = randomToken(16)
    const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')
    const ttl = kind === 'login' ? CHALLENGE_TTL : UNLINK_TTL
    const id = sha256(secret)
    // одна открытая заявка своего вида на пользователя
    this.db.run("DELETE FROM login_challenges WHERE user_id = ? AND kind = ? AND status = 'pending'", user.id, kind)
    this.db.run(
      'INSERT INTO login_challenges (id, ref, user_id, kind, code_hash, ip, ua, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      ref,
      user.id,
      kind,
      this.codeHash(id, code),
      client.ip,
      client.ua.slice(0, 300),
      now,
      now + ttl,
    )
    const mid =
      kind === 'login'
        ? await this.tg!.loginPrompt(user.tg_id!, { ref, code, device: describeDevice(client.ua), at: now })
        : await this.tg!.unlinkPrompt(user.tg_id!, { ref, at: now })
    if (mid !== null) this.db.run('UPDATE login_challenges SET tg_message_id = ? WHERE id = ?', mid, id)
    return { challenge: secret, expiresAt: now + ttl, sent: mid !== null }
  }

  async changePassword(user: UserRow, current: string, password: string, keepSession: string, now: number) {
    if (!(await verifyPassword(current, user.password_hash))) throw new AuthError(401, 'bad_credentials', 'Текущий пароль неверный')
    const pe = passwordError(password, user.login)
    if (pe) throw new AuthError(400, 'weak_password', pe)
    const hash = await hashPassword(password)
    this.db.tx(() => {
      this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, user.id)
      this.db.run('DELETE FROM sessions WHERE user_id = ? AND id != ?', user.id, sha256(keepSession))
    })
    if (user.tg_id !== null && this.tg) void this.tg.notice(user.tg_id, 'Пароль от аккаунта изменён. Если это были не вы, восстановите пароль на сайте.')
    void now
  }

  view(user: UserRow | null, now: number): User {
    if (!user) return GUEST(this.tgEnabled)
    return {
      id: user.id,
      login: user.login,
      email: user.email,
      name: user.login,
      isGuest: false,
      telegram: user.tg_id !== null,
      tgEnabled: this.tgEnabled,
      subscription: subscriptionView(this.db, user.id, readSettings(this.db), now),
    }
  }

  // createSession, touch, dropSession: прежние (см. выше)
}
```

`login.length <= 64` защищает от поиска по гигантской строке; схема тела всё равно ограничивает `maxLength`.

- [ ] **Step 4: Маршруты в `app.ts`**

Удалить `CODE_SCHEMA`, `VERIFY_SCHEMA`, маршруты `/auth/code` и `/auth/verify`, импорт `findOrCreateUser`, `mailer` из `ApiDeps` и деструктуризации. `ApiDeps` получает `tg: TgNotifier | null`. Создание: `const auth = new Auth(db, cfg.pepper, deps.tg, (ip) => authLog('API_AUTH_FAIL', ip))`. Схемы:

```ts
const LOGIN = { type: 'string', minLength: 1, maxLength: 64 }
const PASSWORD = { type: 'string', minLength: 1, maxLength: 200 }
const CONSENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'terms', 'personalData'],
  properties: { version: { type: 'string', maxLength: 20 }, terms: { type: 'boolean' }, personalData: { type: 'boolean' } },
}
const REGISTER_SCHEMA = { type: 'object', additionalProperties: false, required: ['login', 'password', 'consent'], properties: { login: LOGIN, password: PASSWORD, consent: CONSENT_SCHEMA } }
const LOGIN_SCHEMA = { type: 'object', additionalProperties: false, required: ['login', 'password'], properties: { login: LOGIN, password: PASSWORD } }
const PASSWORD_SCHEMA = { type: 'object', additionalProperties: false, required: ['current', 'password'], properties: { current: PASSWORD, password: PASSWORD } }
```

Маршруты (внутри блока `// ---------- вход ----------`):

```ts
      /** Выдать сессию: старая сессия браузера закрывается (защита от фиксации сессии). */
      const signIn = (req: FastifyRequest, reply: FastifyReply, user: UserRow) => {
        auth.dropSession(readCookie(req))
        setCookie(reply, auth.createSession(user.id, req.ip, now()), 30 * 86_400)
        // токен только в HttpOnly-cookie: скрипты страницы его не видят
        return { user: auth.view(user, now()), token: '' }
      }

      api.post<{ Body: { login: string; password: string; consent: RegisterConsent } }>('/auth/register', { schema: { body: REGISTER_SCHEMA } }, async (req, reply) =>
        signIn(req, reply, await auth.register(req.body, client(req), now())),
      )

      api.post<{ Body: { login: string; password: string } }>('/auth/login', { schema: { body: LOGIN_SCHEMA } }, async (req, reply) => {
        const r = await auth.login(req.body.login, req.body.password, client(req), now())
        if ('user' in r) return signIn(req, reply, r.user)
        return { challenge: r.challenge, expiresAt: iso(r.expiresAt), sent: r.sent }
      })

      api.post<{ Body: { current: string; password: string } }>('/auth/password', { schema: { body: PASSWORD_SCHEMA } }, async (req, reply) => {
        await auth.changePassword(needUser(req), req.body.current, req.body.password, readCookie(req) ?? '', now())
        return reply.code(204).send()
      })
```

`GET /auth/me` остаётся. Импорт `RegisterConsent` из `@/api/types`, `UserRow` из `./auth.ts`.

- [ ] **Step 5: Тесты проходят**

Run: `cd server && node --import ./src/register.ts --test src/api/auth.test.ts`
Expected: PASS (8 тестов).

---

### Task 8: 2FA при входе и ручной код

**Files:**
- Modify: `server/src/api/auth.ts`, `server/src/api/app.ts`
- Test: `server/src/api/twofa.test.ts` (новый)

- [ ] **Step 1: Тесты**

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHALLENGE_TTL } from './auth.ts'
import { setup } from './testkit.ts'

async function withTg() {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  await t.logout()
  const r = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  return { t, id, r }
}

test('с Telegram пароль не даёт сессию, в бот уходит заявка с кодом и ref', async () => {
  const { t, r } = await withTg()
  assert.equal(r.statusCode, 200)
  const b = r.json()
  assert.match(b.challenge, /^[\w-]{22}$/)
  assert.equal(b.sent, true)
  assert.equal(t.cookie, '')
  assert.equal(t.tg.sent.length, 1)
  assert.equal(t.tg.sent[0]!.kind, 'login')
  assert.notEqual(t.tg.sent[0]!.ref, b.challenge, 'кнопки бота не знают секрет заявки')
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: b.challenge })).json().status, 'pending')
})

test('кнопка «Подтвердить» от владельца: следующий опрос выдаёт сессию, заявка одноразовая', async () => {
  const { t, r } = await withTg()
  const ch = r.json().challenge
  assert.equal(await t.auth.decide(t.tg.sent[0]!.ref!, 4242, 'ok', t.clock.t), 'approved')
  const done = await t.req('POST', '/api/auth/challenge', { id: ch })
  assert.equal(done.statusCode, 200)
  assert.equal(done.json().user.login, 'boris')
  assert.notEqual(t.cookie, '')
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: ch })).statusCode, 410)
  assert.equal(t.tg.closed.at(-1)!.text, 'Вход подтверждён')
})

test('кнопка от чужого Telegram ничего не меняет', async () => {
  const { t, r } = await withTg()
  assert.equal(await t.auth.decide(t.tg.sent[0]!.ref!, 9999, 'ok', t.clock.t), 'not_yours')
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: r.json().challenge })).json().status, 'pending')
})

test('«Это не я»: вход отклонён, браузер получает 410, бот советует сменить пароль', async () => {
  const { t, r } = await withTg()
  assert.equal(await t.auth.decide(t.tg.sent[0]!.ref!, 4242, 'no', t.clock.t), 'denied')
  const res = await t.req('POST', '/api/auth/challenge', { id: r.json().challenge })
  assert.equal(res.statusCode, 410)
  assert.equal(res.json().code, 'challenge_denied')
  assert.equal(t.tg.closed.at(-1)!.text, 'Вход отклонён. Смените пароль на сайте: «Забыли пароль?».')
})

test('ручной код: верный даёт сессию, 5 неверных закрывают заявку', async () => {
  const { t, r } = await withTg()
  const ch = r.json().challenge
  const code = t.tg.sent[0]!.code!
  const wrong = code === '000000' ? '111111' : '000000'
  for (let i = 0; i < 4; i++) assert.equal((await t.req('POST', '/api/auth/challenge', { id: ch, code: wrong })).json().code, 'bad_code')
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: ch, code })).statusCode, 200)

  await t.logout()
  const r2 = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  const ch2 = r2.json().challenge
  for (let i = 0; i < 5; i++) await t.req('POST', '/api/auth/challenge', { id: ch2, code: wrong })
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: ch2, code: t.tg.sent.at(-1)!.code })).statusCode, 410)
})

test('заявка истекает через 5 минут', async () => {
  const { t, r } = await withTg()
  t.clock.t += CHALLENGE_TTL + 1
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: r.json().challenge })).statusCode, 410)
  assert.equal(await t.auth.decide(t.tg.sent[0]!.ref!, 4242, 'ok', t.clock.t), 'gone')
})

test('Telegram не принял сообщение: заявка есть, sent=false, сессии нет', async () => {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  await t.logout()
  t.tg.ok = false
  const r = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  assert.equal(r.json().sent, false)
  assert.equal(t.cookie, '')
})

test('без токена бота (tg=null) 2FA не включается, вход по паролю', async () => {
  const t = setup({ deps: { tg: null } })
  const id = await t.register()
  t.linkTg(id)
  await t.logout()
  const r = await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })
  assert.ok(r.json().user)
  assert.equal(r.json().user.tgEnabled, false)
})
```

`setup()` должен вернуть `auth` (экземпляр `Auth` из app): в `buildApiApp` вернуть `Object.assign(app, { auth, tgBot })`, в testkit пробросить `auth: app.auth`. Обоснование: бот (задача 10) вызывает те же методы `Auth`, тест проверяет их напрямую.

- [ ] **Step 2: Падает**

Run: `cd server && node --import ./src/register.ts --test src/api/twofa.test.ts`
Expected: FAIL (`/api/auth/challenge` нет, `t.auth` undefined).

- [ ] **Step 3: Методы в `Auth`**

```ts
  /** Опрос или ручной код. Сессию выдаёт только этот вызов с секретом заявки. */
  checkChallenge(secret: string, code: string | undefined, client: Client, now: number): { status: 'pending' } | { user: UserRow } {
    this.limited(this.polls, client.ip, AUTH_LIMITS.challengePerIp, now, 'Слишком много попыток. Попробуйте позже.')
    this.polls.hit(client.ip, now)
    const id = sha256(secret)
    const gone = (code: 'challenge_gone' | 'challenge_denied') =>
      new AuthError(410, code, code === 'challenge_denied' ? 'Вход отклонён в Telegram' : 'Запрос на вход устарел. Войдите ещё раз.')
    const row = this.db.get<{ user_id: string; status: string; code_hash: string; attempts: number; expires_at: number; kind: string }>(
      "SELECT user_id, status, code_hash, attempts, expires_at, kind FROM login_challenges WHERE id = ? AND kind = 'login'",
      id,
    )
    if (!row || row.expires_at <= now) throw gone('challenge_gone')
    if (row.status === 'denied') throw gone('challenge_denied')
    if (code !== undefined && row.status === 'pending') {
      if (!isCode(code) || !timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(this.codeHash(id, code)))) {
        this.db.run('UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?', id)
        this.db.run('DELETE FROM login_challenges WHERE id = ? AND attempts >= ?', id, CHALLENGE_ATTEMPTS)
        this.onFail(client.ip)
        throw new AuthError(400, 'bad_code', 'Неверный код')
      }
    } else if (row.status !== 'approved') return { status: 'pending' }
    // одноразово: параллельный запрос уже забрал заявку - строки нет
    if (!this.db.run('DELETE FROM login_challenges WHERE id = ?', id).changes) throw gone('challenge_gone')
    const user = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', row.user_id)
    if (!user || user.blocked_at) throw new AuthError(403, 'blocked', 'Аккаунт заблокирован. Напишите в поддержку.')
    return { user }
  }

  /** Кнопка в боте. Только владелец (tg_id) открытой заявки. */
  async decide(ref: string, tgId: number, answer: 'ok' | 'no', now: number): Promise<'approved' | 'denied' | 'unlinked' | 'kept' | 'not_yours' | 'gone'> {
    const row = this.db.get<{ id: string; user_id: string; kind: string; status: string; expires_at: number; tg_message_id: number | null }>(
      'SELECT id, user_id, kind, status, expires_at, tg_message_id FROM login_challenges WHERE ref = ?',
      ref,
    )
    if (!row || row.status !== 'pending' || row.expires_at <= now) return 'gone'
    const owner = this.db.get<{ tg_id: number | null }>('SELECT tg_id FROM users WHERE id = ?', row.user_id)
    if (!owner || owner.tg_id !== tgId) return 'not_yours'
    const close = (text: string) => (row.tg_message_id !== null && this.tg ? this.tg.close(tgId, row.tg_message_id, text) : Promise.resolve())
    if (row.kind === 'login') {
      const status = answer === 'ok' ? 'approved' : 'denied'
      this.db.run("UPDATE login_challenges SET status = ? WHERE id = ? AND status = 'pending'", status, row.id)
      await close(status === 'approved' ? 'Вход подтверждён' : 'Вход отклонён. Смените пароль на сайте: «Забыли пароль?».')
      return status
    }
    // kind = unlink
    this.db.run('DELETE FROM login_challenges WHERE id = ?', row.id)
    if (answer === 'no') {
      await close('Защита остаётся включённой')
      return 'kept'
    }
    this.db.tx(() => {
      this.db.run('UPDATE users SET tg_id = NULL, tg_linked_at = NULL WHERE id = ?', row.user_id)
      this.db.run('DELETE FROM sessions WHERE user_id = ?', row.user_id)
    })
    await close('Telegram отключён от аккаунта. Войдите на сайте заново.')
    return 'unlinked'
  }
```

Отвязка закрывает все сессии (в спеке «остальные»): браузер, нажавший «Отключить», тоже выходит. Это проще и безопаснее; текст в боте и на сайте говорит «войдите заново».

- [ ] **Step 4: Маршрут**

```ts
const CHALLENGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', pattern: '^[\\w-]{22}$' }, code: { type: 'string', maxLength: 12 } },
}

      api.post<{ Body: { id: string; code?: string } }>('/auth/challenge', { schema: { body: CHALLENGE_SCHEMA } }, async (req, reply) => {
        const r = auth.checkChallenge(req.body.id, req.body.code, client(req), now())
        return 'user' in r ? signIn(req, reply, r.user) : r
      })
```

- [ ] **Step 5: Проходит**

Run: `cd server && node --import ./src/register.ts --test src/api/twofa.test.ts src/api/auth.test.ts`
Expected: PASS.

---

### Task 9: Привязка, отвязка, восстановление пароля

**Files:**
- Modify: `server/src/api/auth.ts`, `server/src/api/app.ts`
- Test: `server/src/api/tglink.test.ts` (новый)

- [ ] **Step 1: Тесты**

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LINK_TTL, RESET_TTL } from './auth.ts'
import { setup } from './testkit.ts'

const tokenOf = (url: string) => new URL(url).searchParams.get('start')!

test('привязка: ссылка на бота, токен одноразовый, /auth/me видит telegram', async () => {
  const t = setup()
  await t.register()
  const r = await t.req('POST', '/api/tg/link')
  assert.equal(r.statusCode, 200)
  const token = tokenOf(r.json().url)
  assert.match(token, /^[\w-]{43}$/)
  assert.equal(t.auth.linkByToken(token, 4242, t.clock.t), 'linked')
  assert.equal((await t.req('GET', '/api/auth/me')).json().telegram, true)
  assert.equal(t.auth.linkByToken(token, 4242, t.clock.t), 'bad_token')
})

test('привязка: истёкший токен, чужой уже привязанный Telegram, гостю нельзя', async () => {
  const t = setup()
  assert.equal((await t.req('POST', '/api/tg/link')).statusCode, 401)
  const a = await t.register('alice')
  t.linkTg(a, 777)
  await t.logout()
  await t.register('boris')
  const token = tokenOf((await t.req('POST', '/api/tg/link')).json().url)
  assert.equal(t.auth.linkByToken(token, 777, t.clock.t), 'tg_taken')
  const fresh = tokenOf((await t.req('POST', '/api/tg/link')).json().url)
  t.clock.t += LINK_TTL + 1
  assert.equal(t.auth.linkByToken(fresh, 888, t.clock.t), 'bad_token')
})

test('новая ссылка заменяет старую', async () => {
  const t = setup()
  await t.register()
  const old = tokenOf((await t.req('POST', '/api/tg/link')).json().url)
  await t.req('POST', '/api/tg/link')
  assert.equal(t.auth.linkByToken(old, 4242, t.clock.t), 'bad_token')
})

test('отвязка: заявка в бот, «Отключить» снимает Telegram и закрывает сессии; без Telegram 409', async () => {
  const t = setup()
  const id = await t.register()
  assert.equal((await t.req('POST', '/api/tg/unlink')).statusCode, 409)
  t.linkTg(id)
  const r = await t.req('POST', '/api/tg/unlink')
  assert.equal(r.statusCode, 200)
  assert.equal(t.tg.sent.at(-1)!.kind, 'unlink')
  assert.equal(await t.auth.decide(t.tg.sent.at(-1)!.ref!, 4242, 'ok', t.clock.t), 'unlinked')
  assert.equal(t.db.get<{ tg_id: number | null }>('SELECT tg_id FROM users WHERE id = ?', id)!.tg_id, null)
  assert.equal((await t.req('GET', '/api/auth/me')).json().isGuest, true)
})

test('сброс: одинаковый ответ, ссылка только привязанному, одноразовая, сессии закрываются', async () => {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  const before = t.cookie
  // не logout: сессия должна остаться живой до сброса, иначе проверка ниже ничего не докажет
  t.cookie = ''
  const a = await t.req('POST', '/api/auth/reset', { login: 'boris' })
  const b = await t.req('POST', '/api/auth/reset', { login: 'nobody' })
  assert.equal(a.statusCode, 204)
  assert.equal(b.statusCode, 204)
  await t.flush()
  const sent = t.tg.sent.filter((s) => s.kind === 'reset')
  assert.equal(sent.length, 1)
  const url = new URL(sent[0]!.url!)
  assert.equal(url.pathname, '/reset')
  const token = url.hash.slice(1)
  assert.equal((await t.req('POST', '/api/auth/reset/confirm', { token, password: 'short' })).json().code, 'weak_password')
  assert.equal((await t.req('POST', '/api/auth/reset/confirm', { token, password: 'brand new pass' })).statusCode, 204)
  assert.equal((await t.req('POST', '/api/auth/reset/confirm', { token, password: 'brand new pass 2' })).statusCode, 410)
  assert.equal((await t.req('GET', '/api/auth/me', undefined, { cookie: before })).json().isGuest, true)
  assert.equal((await t.req('POST', '/api/auth/login', { login: 'boris', password: 'brand new pass' })).statusCode, 200)
})

test('сброс: ссылка живёт 15 минут, 3 запроса на логин в час', async () => {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  await t.req('POST', '/api/auth/reset', { login: 'boris' })
  await t.flush()
  const token = new URL(t.tg.sent.at(-1)!.url!).hash.slice(1)
  t.clock.t += RESET_TTL + 1
  assert.equal((await t.req('POST', '/api/auth/reset/confirm', { token, password: 'brand new pass' })).statusCode, 410)
  await t.req('POST', '/api/auth/reset', { login: 'boris' })
  await t.req('POST', '/api/auth/reset', { login: 'boris' })
  assert.equal((await t.req('POST', '/api/auth/reset', { login: 'boris' })).statusCode, 429)
})
```

- [ ] **Step 2: Падает**

Run: `cd server && node --import ./src/register.ts --test src/api/tglink.test.ts`
Expected: FAIL.

- [ ] **Step 3: Методы `Auth`**

```ts
  createLink(user: UserRow, now: number): { url: string; expiresAt: number } {
    if (!this.tg) throw new AuthError(503, 'tg_off', 'Telegram временно недоступен')
    if (user.tg_id !== null) throw new AuthError(409, 'tg_linked', 'Telegram уже подключён')
    const token = randomToken(32)
    this.db.run('DELETE FROM tg_links WHERE user_id = ? OR expires_at <= ?', user.id, now)
    this.db.run('INSERT INTO tg_links (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), user.id, now + LINK_TTL)
    return { url: this.tg.linkUrl(token), expiresAt: now + LINK_TTL }
  }

  /** /start <token> в боте. */
  linkByToken(token: string, tgId: number, now: number): 'linked' | 'bad_token' | 'tg_taken' | 'blocked' {
    if (!/^[\w-]{43}$/.test(token)) return 'bad_token'
    return this.db.tx(() => {
      const row = this.db.get<{ user_id: string; expires_at: number }>('SELECT user_id, expires_at FROM tg_links WHERE token_hash = ?', sha256(token))
      if (!row || row.expires_at <= now) return 'bad_token'
      const taken = this.db.get<{ id: string }>('SELECT id FROM users WHERE tg_id = ?', tgId)
      if (taken && taken.id !== row.user_id) return 'tg_taken'
      const user = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', row.user_id)
      if (!user || user.blocked_at) return 'blocked'
      this.db.run('DELETE FROM tg_links WHERE token_hash = ?', sha256(token))
      this.db.run('UPDATE users SET tg_id = ?, tg_linked_at = ? WHERE id = ?', tgId, now, user.id)
      return 'linked'
    })
  }

  loginOfTg(tgId: number): string | null {
    return this.db.get<{ login: string }>('SELECT login FROM users WHERE tg_id = ?', tgId)?.login ?? null
  }

  async startUnlink(user: UserRow, client: Client, now: number) {
    if (!this.tg) throw new AuthError(503, 'tg_off', 'Telegram временно недоступен')
    if (user.tg_id === null) throw new AuthError(409, 'no_tg', 'Telegram не подключён')
    return this.openChallenge(user, 'unlink', client, now)
  }

  /** Ответ всегда одинаков; ссылка уходит в бот только привязанному незаблокированному аккаунту. */
  requestReset(rawLogin: string, origin: string, client: Client, now: number): Promise<boolean> | null {
    const login = normalizeLogin(rawLogin)
    const L = AUTH_LIMITS
    const text = 'Слишком много запросов. Попробуйте позже.'
    this.limited(this.resets, `ip:${client.ip}`, L.resetPerIp, now, text)
    this.limited(this.resets, `l:${login}`, L.resetPerLogin, now, text)
    this.resets.hit(`ip:${client.ip}`, now)
    this.resets.hit(`l:${login}`, now)
    const user = this.byLogin(login)
    if (!user || user.blocked_at || user.tg_id === null || !this.tg) return null
    const token = randomToken(32)
    this.db.run('DELETE FROM password_resets WHERE user_id = ?', user.id)
    this.db.run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), user.id, now + RESET_TTL)
    // токен во фрагменте: браузер не шлёт его серверу, он не попадёт в логи nginx
    return this.tg.resetLink(user.tg_id, `${origin}/reset#${token}`)
  }

  async confirmReset(token: string, password: string, now: number) {
    const gone = new AuthError(410, 'reset_gone', 'Ссылка устарела. Запросите новую.')
    if (!/^[\w-]{43}$/.test(token)) throw gone
    const row = this.db.get<{ user_id: string; expires_at: number; used_at: number | null }>('SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?', sha256(token))
    if (!row || row.used_at !== null || row.expires_at <= now) throw gone
    const user = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', row.user_id)
    if (!user || user.blocked_at) throw gone
    const pe = passwordError(password, user.login)
    if (pe) throw new AuthError(400, 'weak_password', pe)
    const hash = await hashPassword(password)
    this.db.tx(() => {
      if (!this.db.run('UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL', now, sha256(token)).changes) throw gone
      this.db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, user.id)
      this.db.run('DELETE FROM sessions WHERE user_id = ?', user.id)
      this.db.run("DELETE FROM login_challenges WHERE user_id = ? AND status = 'pending'", user.id)
    })
    if (user.tg_id !== null && this.tg) void this.tg.notice(user.tg_id, 'Пароль изменён, все устройства вышли из аккаунта.')
  }
```

- [ ] **Step 4: Маршруты**

```ts
const RESET_SCHEMA = { type: 'object', additionalProperties: false, required: ['login'], properties: { login: LOGIN } }
const RESET_CONFIRM_SCHEMA = { type: 'object', additionalProperties: false, required: ['token', 'password'], properties: { token: { type: 'string', maxLength: 64 }, password: PASSWORD } }

      api.post<{ Body: { login: string } }>('/auth/reset', { schema: { body: RESET_SCHEMA } }, async (req, reply) => {
        void auth.requestReset(req.body.login, cfg.origin, client(req), now())
        return reply.code(204).send()
      })
      api.post<{ Body: { token: string; password: string } }>('/auth/reset/confirm', { schema: { body: RESET_CONFIRM_SCHEMA } }, async (req, reply) => {
        await auth.confirmReset(req.body.token, req.body.password, now())
        return reply.code(204).send()
      })
      api.post('/tg/link', async (req) => {
        const r = auth.createLink(needUser(req), now())
        return { url: r.url, expiresAt: iso(r.expiresAt) }
      })
      api.post('/tg/unlink', async (req) => {
        const r = await auth.startUnlink(needUser(req), client(req), now())
        return { challenge: r.challenge, expiresAt: iso(r.expiresAt), sent: r.sent }
      })
```

`POST /tg/link` и `/tg/unlink` без тела: в Fastify пустое тело с `content-type: application/json` даёт 400, поэтому testkit не ставит заголовок при `body === undefined` (уже так).

- [ ] **Step 5: Проходит**

Run: `cd server && node --import ./src/register.ts --test src/api/tglink.test.ts src/api/twofa.test.ts src/api/auth.test.ts`
Expected: PASS.

---

### Task 10: Бот: разбор апдейтов и опрос

**Files:**
- Create: `server/src/api/tg/bot.ts`, `server/src/api/tg/poll.ts`
- Test: `server/src/api/tg/bot.test.ts`

- [ ] **Step 1: Тесты**

```ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TgApi, TgUpdate } from './api.ts'
import { TgBot } from './bot.ts'
import { pollOnce } from './poll.ts'
import { setup } from '../testkit.ts'

function fakeApi() {
  const out: { chat: number; text: string }[] = []
  const answers: string[] = []
  const api = {
    sendMessage: async (chat: number, text: string) => (out.push({ chat, text }), { message_id: 1 }),
    answerCallbackQuery: async (_id: string, text?: string) => void answers.push(text ?? ''),
  } as unknown as TgApi
  return { api, out, answers }
}
const msg = (from: number, text: string, type = 'private'): TgUpdate => ({ update_id: 1, message: { message_id: 1, chat: { id: from, type }, from: { id: from }, text } })

test('/start <token> привязывает и отвечает логином; /status показывает логин', async () => {
  const t = setup()
  await t.register()
  const token = new URL((await t.req('POST', '/api/tg/link')).json().url).searchParams.get('start')!
  const f = fakeApi()
  const bot = new TgBot(t.auth, f.api, 'https://ru-chatgpt.test', () => t.clock.t)
  await bot.handle(msg(4242, `/start ${token}`))
  assert.match(f.out.at(-1)!.text, /boris.*подтверждён/s)
  await bot.handle(msg(4242, '/status'))
  assert.match(f.out.at(-1)!.text, /boris/)
})

test('/start без токена и прочий текст: подсказка; группы игнорируются', async () => {
  const t = setup()
  const f = fakeApi()
  const bot = new TgBot(t.auth, f.api, 'https://ru-chatgpt.test', () => t.clock.t)
  await bot.handle(msg(1, '/start'))
  assert.match(f.out.at(-1)!.text, /ru-chatgpt\.test/)
  await bot.handle(msg(1, 'привет'))
  assert.match(f.out.at(-1)!.text, /поддержк/)
  const n = f.out.length
  await bot.handle(msg(-100, '/start x', 'supergroup'))
  assert.equal(f.out.length, n)
})

test('кнопки: белый список callback_data, ответ на нажатие всегда', async () => {
  const t = setup()
  const id = await t.register()
  t.linkTg(id)
  await t.logout()
  const ch = (await t.req('POST', '/api/auth/login', { login: 'boris', password: 'correct horse' })).json().challenge
  const f = fakeApi()
  const bot = new TgBot(t.auth, f.api, 'https://ru-chatgpt.test', () => t.clock.t)
  await bot.handle({ update_id: 2, callback_query: { id: 'q1', from: { id: 4242 }, data: 'rm -rf' } })
  assert.equal(f.answers.length, 1)
  await bot.handle({ update_id: 3, callback_query: { id: 'q2', from: { id: 4242 }, data: `ok:${t.tg.sent[0]!.ref}` } })
  assert.equal((await t.req('POST', '/api/auth/challenge', { id: ch })).statusCode, 200)
})

test('pollOnce: offset сохраняется в meta, сбой одного апдейта не останавливает остальные', async () => {
  const t = setup()
  const seen: number[] = []
  const api = { getUpdates: async (offset: number) => (offset === 0 ? [{ update_id: 10 }, { update_id: 11 }] : []) } as unknown as TgApi
  await pollOnce(t.db, api, async (u) => {
    seen.push(u.update_id)
    if (u.update_id === 10) throw new Error('boom')
  })
  assert.deepEqual(seen, [10, 11])
  assert.equal(t.db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'tg_offset'")!.value, '12')
})
```

- [ ] **Step 2: Падает**

Run: `cd server && node --import ./src/register.ts --test src/api/tg/bot.test.ts`
Expected: FAIL.

- [ ] **Step 3: `bot.ts`**

```ts
/** Апдейты бота входа: /start <token>, /status, кнопки 2FA и отвязки. Только личные чаты. */
import type { Auth } from '../auth.ts'
import type { TgApi, TgUpdate } from './api.ts'

const CALLBACK = /^(ok|no):([\w-]{22})$/
const START = /^\/start(?:@\w+)?(?:\s+([\w-]{1,64}))?\s*$/

export class TgBot {
  constructor(
    private auth: Auth,
    private api: TgApi,
    private origin: string,
    private now: () => number,
  ) {}

  async handle(u: TgUpdate): Promise<void> {
    if (u.callback_query) return this.onCallback(u.callback_query)
    const m = u.message
    if (!m || m.chat.type !== 'private' || !m.from) return
    const text = (m.text ?? '').trim()
    const start = START.exec(text)
    if (start) {
      if (!start[1]) return this.say(m.chat.id, `Этот бот защищает аккаунт на ${this.origin}: подтверждает вход и помогает восстановить пароль. Подключить: на сайте, раздел «Аккаунт».`)
      const r = this.auth.linkByToken(start[1], m.from.id, this.now())
      const replies = {
        linked: `Аккаунт ${this.auth.loginOfTg(m.from.id)} подтверждён. Теперь вход подтверждается здесь.`,
        bad_token: 'Ссылка устарела или уже использована. Откройте новую на сайте.',
        tg_taken: 'Этот Telegram уже подключён к другому аккаунту. Сначала отключите его там.',
        blocked: 'Аккаунт заблокирован. Напишите в поддержку.',
      }
      return this.say(m.chat.id, replies[r])
    }
    if (/^\/status(?:@\w+)?$/.test(text)) {
      const login = this.auth.loginOfTg(m.from.id)
      return this.say(m.chat.id, login ? `Подключён к аккаунту ${login}.` : 'Этот Telegram не подключён ни к одному аккаунту.')
    }
    return this.say(m.chat.id, 'Здесь только подтверждение входа. С вопросами пишите в бота поддержки, ссылка на сайте.')
  }

  private async onCallback(q: NonNullable<TgUpdate['callback_query']>) {
    const m = CALLBACK.exec(q.data ?? '')
    let text = 'Запрос устарел'
    if (m) {
      const r = await this.auth.decide(m[2]!, q.from.id, m[1] as 'ok' | 'no', this.now())
      text = { approved: 'Вход подтверждён', denied: 'Вход отклонён', unlinked: 'Telegram отключён', kept: 'Отменено', not_yours: 'Это не ваш запрос', gone: 'Запрос устарел' }[r]
    }
    await this.api.answerCallbackQuery(q.id, text).catch(() => {})
  }

  private async say(chat: number, text: string) {
    await this.api.sendMessage(chat, text).catch((e: Error) => process.stderr.write(`tg reply failed: ${e.message}\n`))
  }
}
```

- [ ] **Step 4: `poll.ts`**

```ts
/** Long polling getUpdates. offset в meta: после перезапуска старые апдейты не обрабатываются повторно. */
import type { Db } from '../db.ts'
import type { TgApi, TgUpdate } from './api.ts'

const KEY = 'tg_offset'

export async function pollOnce(db: Db, api: TgApi, handle: (u: TgUpdate) => Promise<void>, signal?: AbortSignal, timeoutSec = 30) {
  const offset = Number(db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', KEY)?.value ?? 0)
  const updates = await api.getUpdates(offset, timeoutSec, signal)
  for (const u of updates) {
    try {
      await handle(u)
    } catch (e) {
      process.stderr.write(`tg update failed: ${(e as Error).message.slice(0, 200)}\n`)
    }
    db.run('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', KEY, String(u.update_id + 1))
  }
}

/** Бесконечный цикл с паузой после ошибки сети. */
export async function runPolling(db: Db, api: TgApi, handle: (u: TgUpdate) => Promise<void>, signal: AbortSignal) {
  while (!signal.aborted) {
    try {
      await pollOnce(db, api, handle, AbortSignal.any([signal, AbortSignal.timeout(40_000)]))
    } catch (e) {
      if (signal.aborted) return
      process.stderr.write(`tg poll: ${(e as Error).message.slice(0, 200)}\n`)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
}
```

- [ ] **Step 5: Проходит**

Run: `cd server && node --import ./src/register.ts --test src/api/tg/bot.test.ts`
Expected: PASS.

---

### Task 11: Конфиг, установка, запуск, чистка, оплата

**Files:**
- Modify: `server/src/api/config.ts`, `config.test.ts`, `setup.ts`, `setup.test.ts`, `scripts/api-setup.ts`, `main.ts`, `sweep.ts`, `billing.ts`, `app.ts` (checkout), `billing.test.ts`, `server/package.json`
- Delete: `server/src/api/mailer.ts`

- [ ] **Step 1: Тесты конфига и установки**

В `config.test.ts`: из `base` убрать `SMTP_URL`, `MAIL_FROM`; добавить `TG_BOT_TOKEN: '123456789:' + 'A'.repeat(35)`. Заменить тест про SMTP на:

```ts
test('токен бота: необязателен, но кривой не принимается', () => {
  assert.equal(loadApiConfig(base).tgToken, '123456789:' + 'A'.repeat(35))
  assert.equal(loadApiConfig({ ...base, TG_BOT_TOKEN: '' }).tgToken, '')
  assert.throws(() => loadApiConfig({ ...base, TG_BOT_TOKEN: 'bad token' }), /TG_BOT_TOKEN/)
})
```

и убрать `SMTP_URL`/`MAIL_LOG` из остальных проверок (`/SMTP_URL/` assert удалить, `mail.mode` asserts удалить).

В `setup.test.ts`: `ApiEnvValues` без `smtp`, `mailFrom`, с `tgToken`; тест «SMTP-пароль…» удалить; добавить:

```ts
test('токен бота валидируется и попадает в env; пустой закомментирован', () => {
  assert.ok(validateApiEnv({ ...v, tgToken: 'nope' }).length)
  assert.equal(envValue(renderApiEnv(v), 'TG_BOT_TOKEN'), v.tgToken)
  assert.equal(envValue(renderApiEnv({ ...v, tgToken: '' }), 'TG_BOT_TOKEN'), null)
})
```

с `tgToken: '123456789:' + 'B'.repeat(35)` в `v`.

- [ ] **Step 2: Реализация конфига**

`config.ts`: удалить `mail` из `ApiConfig` и блок SMTP; добавить поле `/** Пусто: бот выключен, Telegram-функции отвечают 503 tg_off. */ tgToken: string` и:

```ts
  const tgToken = env.TG_BOT_TOKEN?.trim() ?? ''
  if (tgToken && !/^\d{6,12}:[\w-]{30,60}$/.test(tgToken)) errors.push('TG_BOT_TOKEN: неожиданный формат (123456:ABC…)')
```

`setup.ts`: `ApiEnvValues = { origin, pepper, openrouterKey, tgToken, dailyUsdCap }`; `validateApiEnv` без SMTP-проверок, с `if (v.tgToken && !/^\d{6,12}:[\w-]{30,60}$/.test(v.tgToken)) e.push('Токен бота: 123456:ABC… из @BotFather')`; `renderApiEnv` вместо `SMTP_URL`/`MAIL_FROM` строка `v.tgToken ? \`TG_BOT_TOKEN=${v.tgToken}\` : '# TG_BOT_TOKEN= (не задан: вход без Telegram-2FA)'`. Удалить `smtpUrl`.

`scripts/api-setup.ts`: блок SMTP заменить на

```ts
console.log('\nБот входа: @BotFather → /newbot, токен вида 123456:ABC…. Пустой ввод: оставить прежний (или без Telegram).')
const tgToken = (await ask('TG_BOT_TOKEN (ввод скрыт): ')).trim() || (envValue(old, 'TG_BOT_TOKEN') ?? '')
```

и `v` без `smtp`/`mailFrom`, с `tgToken`. Убрать из шапки упоминание почты.

- [ ] **Step 3: `main.ts`**

```ts
import { httpTgApi } from './tg/api.ts'
import { TgBot } from './tg/bot.ts'
import { tgNotifier, type TgNotifier } from './tg/notify.ts'
import { runPolling } from './tg/poll.ts'

// … после cfg и db:
let tg: TgNotifier | null = null
const tgApi = cfg.tgToken ? httpTgApi(cfg.tgToken) : null
if (tgApi) {
  try {
    const me = await tgApi.getMe()
    await tgApi.deleteWebhook()
    tg = tgNotifier(tgApi, me.username, cfg.origin)
  } catch (e) {
    process.stderr.write(`telegram off: ${(e as Error).message}\n`)
  }
}
const app = buildApiApp(cfg, { db, files, tg, llm: cfg.llmStub ? stubLlm() : cfg.openrouterKey ? openRouter(cfg.openrouterKey, cfg.origin) : null, authLog })
const stopTg = new AbortController()
if (tg && tgApi) void runPolling(db, tgApi, (u) => app.tgBot!.handle(u), stopTg.signal)
```

в обработчике SIGTERM добавить `stopTg.abort()` первой строкой. Строку запуска: `(${tg ? `tg: @${tg.botName}` : 'tg: выключен'}${…llm…})` вместо `mail:`.

`main.ts` передаёт в `buildApiApp` ещё `tgApi: tg ? tgApi : null`. В `app.ts`:

```ts
import type { TgApi } from './tg/api.ts'
import { TgBot } from './tg/bot.ts'
import type { TgNotifier } from './tg/notify.ts'

export interface ApiDeps {
  // … прежние поля без mailer
  tg: TgNotifier | null
  /** Для разбора апдейтов (ответы в чат, answerCallbackQuery). null в тестах HTTP. */
  tgApi?: TgApi | null
}

// в конце buildApiApp, вместо return app:
  const tgBot = deps.tgApi ? new TgBot(auth, deps.tgApi, cfg.origin, now) : null
  return Object.assign(app, { auth, tgBot })
```

`now` здесь та же функция часов, что у маршрутов (`deps.now ?? Date.now`).

- [ ] **Step 4: `sweep.ts`**

Строку `DELETE FROM auth_codes …` заменить на:

```ts
  db.run('DELETE FROM tg_links WHERE expires_at <= ?', now)
  db.run('DELETE FROM login_challenges WHERE expires_at <= ?', now)
  db.run('DELETE FROM password_resets WHERE expires_at <= ? OR used_at IS NOT NULL', now)
```

и комментарий в шапке: «просроченные сессии, ссылки и заявки входа».

- [ ] **Step 5: Checkout с email для чека**

`CHECKOUT_SCHEMA`: `required` + `'email'`, `properties.email: { type: 'string', maxLength: 254 }`. `CheckoutRequest` (src/api/types.ts) получает `email: string`. В обработчике после проверки `current`:

```ts
        const email = normalizeEmail(b.email)
        if (!isEmail(email)) return reply.code(400).send({ message: 'Введите корректный email для чека', code: 'bad_email' })
```

в транзакции перед `createPendingPayment`: `db.run('UPDATE users SET email = ? WHERE id = ?', email, current.id)`, а в `createPendingPayment` и `provider.create` передавать `{ ...b, email }` (нормализованный). `provider.create({ … email … })` без других изменений.

`billing.ts`, INSERT в `createPendingPayment`:

```ts
  db.run(
    `INSERT INTO payments (id, user_id, provider, tier, plan_id, amount, status, repeat, auto_renew, consent, receipt_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, 1, ?, ?, ?)`,
    id,
    a.userId,
    a.provider,
    a.req.tier,
    a.req.planId,
    amount,
    repeat ? 1 : 0,
    JSON.stringify(a.req.consent),
    a.req.email,
    a.now,
  )
```

Шапку `billing.ts`, строку «платёж за гостя не даёт сессию: войти можно только кодом из письма на этот адрес», заменить на «платёж только из аккаунта; email нужен лишь для чека и сессию не даёт».

В `billing.test.ts` все тела checkout получают `email: 'buyer@example.ru'`; добавить:

```ts
test('checkout: email для чека обязателен и сохраняется в платеже и профиле', async () => {
  const t = setup({ deps: { provider: fakeProvider() } })
  await t.register()
  const body = { planId: 'week', tier: 'text', method: 'card', consent: { version: LEGAL_VERSION, terms: true, recurring: true } }
  assert.equal((await t.req('POST', '/api/billing/checkout', { ...body, email: 'nope' })).json().code, 'bad_email')
  const r = await t.req('POST', '/api/billing/checkout', { ...body, email: 'Buyer@Example.ru' })
  assert.equal(r.statusCode, 200)
  assert.equal(t.db.get<{ receipt_email: string }>('SELECT receipt_email FROM payments')!.receipt_email, 'buyer@example.ru')
  assert.equal((await t.req('GET', '/api/auth/me')).json().email, 'buyer@example.ru')
})
```

(`fakeProvider` уже есть в billing.test.ts; если называется иначе, взять существующий хелпер включённого провайдера.)

- [ ] **Step 6: Удалить почту**

`rm server/src/api/mailer.ts`; в `server/package.json` убрать `nodemailer` и `@types/nodemailer`; `cd server && npm install --no-audit --no-fund`. `grep -rn "mailer\|nodemailer\|SMTP" server/src server/scripts` должен быть пустым (кроме этого плана).

- [ ] **Step 7: Весь сервер**

Run: `cd server && npm test && npx tsc --noEmit`
Expected: все тесты PASS, tsc без ошибок. `chat.test.ts`, `images.test.ts` проходят без правок благодаря совместимому `t.register()`.

- [ ] **Step 8: Контрольная точка**

Run: `cd server && npm test 2>&1 | grep -E '(pass|fail) [0-9]+'`
Expected: `fail 0`.

---

### Task 12: Типы и контракт фронта

**Files:**
- Modify: `src/api/types.ts`, `src/api/services/contracts.ts`, `src/api/services/http.ts`
- Test: `src/api/__tests__/http.spec.ts` (дописать)

- [ ] **Step 1: Типы**

В `src/api/types.ts`:
- удалить `AuthIntent`;
- `User`:

```ts
export interface User {
  id: ID
  /** null у гостя. */
  login: string | null
  /** Email для чеков: последний введённый в форме оплаты. */
  email: string | null
  name: string
  isGuest: boolean
  /** Telegram привязан: вход подтверждается в боте, пароль можно восстановить. */
  telegram: boolean
  /** На сервере включён бот входа. false: плашку и кнопки Telegram не показываем. */
  tgEnabled: boolean
  subscription: Subscription | null
}

export interface Session {
  user: User
  /** Только у мока; настоящий сервер держит сессию в HttpOnly-cookie. */
  token: string
}
/** Пароль верный, нужен второй фактор. */
export interface Challenge {
  challenge: string
  expiresAt: ISODate
  /** false: сообщение в Telegram не ушло. */
  sent: boolean
}
export type LoginResult = Session | Challenge
export type ChallengeResult = Session | { status: 'pending' }
```

- `CheckoutRequest` + `email: string`.

- [ ] **Step 2: Контракт**

```ts
export interface AuthService {
  me(): Promise<User>
  register(login: string, password: string, consent: RegisterConsent): Promise<Session>
  /** Ответ на неверную пару и на несуществующий логин одинаков. */
  login(login: string, password: string): Promise<LoginResult>
  /** Опрос заявки 2FA или ввод кода. 410: заявка отклонена или устарела. */
  challenge(id: string, code?: string): Promise<ChallengeResult>
  changePassword(current: string, password: string): Promise<void>
  /** Ответ одинаков для любого логина. */
  requestReset(login: string): Promise<void>
  confirmReset(token: string, password: string): Promise<void>
  linkTelegram(): Promise<{ url: string; expiresAt: ISODate }>
  unlinkTelegram(): Promise<Challenge>
  logout(): Promise<void>
}
```

Импорт `AuthIntent` заменить на `Challenge, ChallengeResult, ISODate, LoginResult, Session`.

- [ ] **Step 3: HTTP-реализация**

```ts
export const httpAuth: AuthService = {
  me: () => http.get<User>('/auth/me'),
  register: (login, password, consent) => http.post('/auth/register', { login, password, consent }),
  login: (login, password) => http.post('/auth/login', { login, password }),
  challenge: (id, code) => http.post('/auth/challenge', code === undefined ? { id } : { id, code }),
  changePassword: (current, password) => http.post('/auth/password', { current, password }),
  requestReset: (login) => http.post('/auth/reset', { login }),
  confirmReset: (token, password) => http.post('/auth/reset/confirm', { token, password }),
  linkTelegram: () => http.post('/tg/link'),
  unlinkTelegram: () => http.post('/tg/unlink'),
  logout: () => http.post('/auth/logout'),
}
```

В шапке файла список маршрутов `/auth/*` обновить под таблицу из спеки.

- [ ] **Step 4: Тест HTTP-клиента**

В `http.spec.ts` (по образцу существующих тестов с подменой `fetch`) добавить:

```ts
it('auth.login шлёт логин и пароль POST JSON, challenge без кода не шлёт code', async () => {
  const calls: { url: string; body: string }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, body: String(init.body) })
    return new Response(JSON.stringify({ status: 'pending' }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  await httpAuth.login('boris', 'pw')
  await httpAuth.challenge('x'.repeat(22))
  expect(calls[0]!.url).toMatch(/\/auth\/login$/)
  expect(JSON.parse(calls[0]!.body)).toEqual({ login: 'boris', password: 'pw' })
  expect(JSON.parse(calls[1]!.body)).toEqual({ id: 'x'.repeat(22) })
  vi.unstubAllGlobals()
})
```

- [ ] **Step 5: Запуск**

Run: `npx vitest run src/api/__tests__/http.spec.ts`
Expected: PASS. `npm run typecheck` пока падает в моке, сторе и страницах: задачи 13-15.

---

### Task 13: Мок

**Files:**
- Modify: `src/api/mocks/index.ts`
- Test: `src/api/__tests__/mockAuth.spec.ts` (переписать)

- [ ] **Step 1: Тест мока**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LEGAL_VERSION } from '@/content/legal/operator'
import { MOCK_CODE, mockAuth } from '../mocks'

const consent = { version: LEGAL_VERSION, terms: true as const, personalData: true as const }

describe('mock auth', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  it('регистрация, выход, вход по паролю; неверный пароль и чужой логин одинаковы', async () => {
    const s = await mockAuth.register('Boris', 'correct horse', consent)
    expect(s.user.login).toBe('boris')
    expect(s.user.telegram).toBe(false)
    await mockAuth.logout()
    const e1 = await mockAuth.login('boris', 'nope nope').catch((e) => e)
    const e2 = await mockAuth.login('nobody', 'nope nope').catch((e) => e)
    expect(e1.message).toBe(e2.message)
    expect(e1.code).toBe('bad_credentials')
    const ok = await mockAuth.login('boris', 'correct horse')
    expect('user' in ok && ok.user.login).toBe('boris')
  })

  it('занятый логин и слабый пароль', async () => {
    await mockAuth.register('boris', 'correct horse', consent)
    await expect(mockAuth.register('BORIS', 'correct horse', consent)).rejects.toMatchObject({ code: 'login_taken' })
    await expect(mockAuth.register('alice', 'short', consent)).rejects.toMatchObject({ code: 'weak_password' })
  })

  it('Telegram: привязка через 2 с, потом вход с подтверждением; код MOCK_CODE работает сразу', async () => {
    await mockAuth.register('boris', 'correct horse', consent)
    const link = await mockAuth.linkTelegram()
    expect(link.url).toMatch(/^https:\/\/t\.me\//)
    await vi.advanceTimersByTimeAsync(2100)
    expect((await mockAuth.me()).telegram).toBe(true)
    await mockAuth.logout()
    const r = await mockAuth.login('boris', 'correct horse')
    expect('challenge' in r).toBe(true)
    if (!('challenge' in r)) return
    expect(await mockAuth.challenge(r.challenge)).toEqual({ status: 'pending' })
    const s = await mockAuth.challenge(r.challenge, MOCK_CODE)
    expect('user' in s && s.user.login).toBe('boris')
  })
})
```

- [ ] **Step 2: Падает**

Run: `npx vitest run src/api/__tests__/mockAuth.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Реализация мока**

Заменить блок `MOCK_CODE … mockAuth` в `src/api/mocks/index.ts`:

```ts
/** Код 2FA в моке всегда один: подсказка на экране входа в режиме моков. */
export const MOCK_CODE = '000000'
/** Через сколько мок-«бот» подтверждает привязку и вход. */
const MOCK_TG_DELAY = 2000

interface MockAccount {
  id: string
  login: string
  password: string
  telegram: boolean
  email: string | null
  consent: (RegisterConsent | CheckoutConsent) & { at: string }
}
const loadAccounts = () => storage.get<Record<string, MockAccount>>(K.accounts, {})
const saveAccount = (a: MockAccount) => storage.set(K.accounts, { ...loadAccounts(), [a.login]: a })
const pending = new Map<string, { login: string; approved: boolean }>()

const userOf = (a: MockAccount, prev: User): User => ({
  id: a.id,
  login: a.login,
  email: a.email,
  name: a.login,
  isGuest: false,
  telegram: a.telegram,
  tgEnabled: true,
  // тот же аккаунт: подписка сохраняется
  subscription: !prev.isGuest && prev.id === a.id ? prev.subscription : null,
})
const signIn = (a: MockAccount): Session => {
  const user = userOf(a, loadUser())
  storage.set(K.user, user)
  return { user, token: 'mock-token' }
}
const current = (): MockAccount | null => {
  const u = loadUser()
  return u.isGuest || !u.login ? null : (loadAccounts()[u.login] ?? null)
}

export const mockAuth: AuthService = {
  async me() {
    await sleep(120)
    const a = current()
    const user = a ? { ...loadUser(), telegram: a.telegram, email: a.email } : loadUser()
    if (user.subscription) {
      user.subscription.tier ??= 'text'
      user.subscription.usage = freshUsage(user.subscription.usage, new Date())
      withSettings(user.subscription, loadSettings())
    }
    return user
  },
  async register(rawLogin, password, consent) {
    await sleep(300)
    const login = normalizeLogin(rawLogin)
    const le = loginError(login)
    if (le) throw new ApiError(le, 400, 'bad_login')
    const pe = passwordError(password, login)
    if (pe) throw new ApiError(pe, 400, 'weak_password')
    if (!registerConsentOk(consent)) throw new ApiError('Нужно принять документы и дать согласие на обработку данных', 422, 'consent')
    if (loadAccounts()[login]) throw new ApiError('Этот логин занят', 409, 'login_taken')
    const a: MockAccount = { id: uid('u_'), login, password, telegram: false, email: null, consent: { ...consent, at: new Date().toISOString() } }
    saveAccount(a)
    return signIn(a)
  },
  async login(rawLogin, password) {
    await sleep(300)
    const a = loadAccounts()[normalizeLogin(rawLogin)]
    if (!a || a.password !== password) throw new ApiError('Неверный логин или пароль', 401, 'bad_credentials')
    if (!a.telegram) return signIn(a)
    const id = uid('ch_').padEnd(22, 'x').slice(0, 22)
    pending.set(id, { login: a.login, approved: false })
    setTimeout(() => {
      const p = pending.get(id)
      if (p) p.approved = true
    }, MOCK_TG_DELAY)
    return { challenge: id, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), sent: true }
  },
  async challenge(id, code) {
    await sleep(150)
    const p = pending.get(id)
    if (!p) throw new ApiError('Запрос на вход устарел. Войдите ещё раз.', 410, 'challenge_gone')
    if (code !== undefined && code !== MOCK_CODE) throw new ApiError('Неверный код', 400, 'bad_code')
    if (code === undefined && !p.approved) return { status: 'pending' }
    pending.delete(id)
    return signIn(loadAccounts()[p.login]!)
  },
  async changePassword(cur, password) {
    await sleep(300)
    const a = current()
    if (!a) throw new ApiError('Нужно войти', 401, 'auth')
    if (a.password !== cur) throw new ApiError('Текущий пароль неверный', 401, 'bad_credentials')
    const pe = passwordError(password, a.login)
    if (pe) throw new ApiError(pe, 400, 'weak_password')
    saveAccount({ ...a, password })
  },
  async requestReset() {
    await sleep(300)
  },
  async confirmReset(token, password) {
    await sleep(300)
    // в моке ссылка из «бота»: #mock-<логин>
    const a = loadAccounts()[token.replace(/^mock-/, '')]
    if (!a) throw new ApiError('Ссылка устарела. Запросите новую.', 410, 'reset_gone')
    const pe = passwordError(password, a.login)
    if (pe) throw new ApiError(pe, 400, 'weak_password')
    saveAccount({ ...a, password })
  },
  async linkTelegram() {
    await sleep(200)
    const a = current()
    if (!a) throw new ApiError('Нужно войти', 401, 'auth')
    setTimeout(() => saveAccount({ ...a, telegram: true }), MOCK_TG_DELAY)
    return { url: 'https://t.me/ruchatgpt_auth_bot?start=mock', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() }
  },
  async unlinkTelegram() {
    await sleep(200)
    const a = current()
    if (!a?.telegram) throw new ApiError('Telegram не подключён', 409, 'no_tg')
    setTimeout(() => {
      saveAccount({ ...a, telegram: false })
      storage.remove(K.user)
    }, MOCK_TG_DELAY)
    return { challenge: 'mock-unlink'.padEnd(22, 'x'), expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), sent: true }
  },
  async logout() {
    storage.remove(K.user)
  },
}
```

Импорты мока: заменить `CODE_MAX_ATTEMPTS, CODE_TTL_MIN, RESEND_SECONDS, isCode, isEmail, normalizeEmail` на `loginError, normalizeLogin, passwordError` (`isEmail`, `normalizeEmail` оставить, если их использует mock checkout). Удалить `K.codes`. Гость (`loadUser()` по умолчанию) получает `login: null, telegram: false, tgEnabled: true`. Mock `checkout` принимает `req.email`, проверяет `isEmail` (`bad_email`, 400) и пишет в аккаунт `email`.

- [ ] **Step 4: Проходит**

Run: `npx vitest run src/api/__tests__`
Expected: PASS (mockChat тоже: у него `register` через мок не используется; если использует `requestCode`, заменить на `mockAuth.register('boris', 'correct horse', consent)`).

---

### Task 14: Стор пользователя и страница входа

**Files:**
- Modify: `src/stores/user.ts`, `src/pages/AuthPage.vue` (переписать), `src/components/ui/AuthDialog.vue`
- Test: `src/stores/__tests__/user.spec.ts` (новый)

- [ ] **Step 1: Тест стора**

```ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const login = vi.fn()
const challenge = vi.fn()
vi.mock('@/api', async (orig) => {
  const real = await orig<typeof import('@/api')>()
  return { ...real, api: { ...real.api, auth: { ...real.api.auth, login, challenge } } }
})
const { useUserStore } = await import('../user')

const user = { id: 'u1', login: 'boris', email: null, name: 'boris', isGuest: false, telegram: true, tgEnabled: true, subscription: null }

describe('user store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    login.mockReset()
    challenge.mockReset()
  })

  it('вход без 2FA: пользователь сразу', async () => {
    login.mockResolvedValue({ user, token: '' })
    const s = useUserStore()
    expect(await s.login('boris', 'pw')).toEqual({ done: true })
    expect(s.user?.login).toBe('boris')
  })

  it('вход с 2FA: сначала заявка, потом finishChallenge', async () => {
    login.mockResolvedValue({ challenge: 'c'.repeat(22), expiresAt: '2026-11-16T09:05:00Z', sent: true })
    const s = useUserStore()
    const r = await s.login('boris', 'pw')
    expect(r).toEqual({ done: false, challenge: 'c'.repeat(22), expiresAt: '2026-11-16T09:05:00Z', sent: true })
    expect(s.user).toBeNull()
    challenge.mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ user, token: '' })
    expect(await s.finishChallenge('c'.repeat(22))).toBe(false)
    expect(await s.finishChallenge('c'.repeat(22))).toBe(true)
    expect(s.user?.telegram).toBe(true)
  })
})
```

- [ ] **Step 2: Падает**

Run: `npx vitest run src/stores/__tests__/user.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Стор**

В `src/stores/user.ts` заменить `login` и добавить методы; `displayName`: `user.value?.login ?? 'Гость'`; добавить `const isProtected = computed(() => !!user.value?.telegram)`, `const showUnprotected = computed(() => !isGuest.value && !!user.value?.tgEnabled && !user.value?.telegram)`:

```ts
  function applySession(s: Session) {
    // настоящий сервер держит сессию в HttpOnly-cookie и токен не отдаёт; токен только у мока
    token.value = s.token || null
    if (s.token) storage.set(TOKEN_KEY, s.token)
    else storage.remove(TOKEN_KEY)
    user.value = s.user
    ready.value = true
  }

  async function register(login: string, password: string, consent: RegisterConsent) {
    applySession(await api.auth.register(login, password, consent))
  }

  /** done=false: пароль верный, ждём подтверждения в Telegram. */
  async function login(login: string, password: string): Promise<{ done: true } | ({ done: false } & Challenge)> {
    const r = await api.auth.login(login, password)
    if ('user' in r) {
      applySession(r)
      return { done: true }
    }
    return { done: false, ...r }
  }

  /** true: вход завершён. Ошибка 410 пробрасывается (заявка отклонена или устарела). */
  async function finishChallenge(id: string, code?: string): Promise<boolean> {
    const r = await api.auth.challenge(id, code)
    if ('user' in r) {
      applySession(r)
      return true
    }
    return false
  }
```

Экспортировать `register`, `login`, `finishChallenge`, `isProtected`, `showUnprotected`. Импорт типов `Challenge, RegisterConsent, Session` из `@/api`.

- [ ] **Step 4: `AuthPage.vue`**

Переписать `<script setup>`; шаблон и стили по образцу текущего (те же классы `au`, `au__card`, `au__lbl`, `au__field`, `au__sub`, кнопки `btn btn--ink btn--block`). Шаги `step`: `'form' | 'wait' | 'forgot' | 'forgot-sent'`.

```ts
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError, api } from '@/api'
import BrandMark from '@/components/ui/BrandMark.vue'
import { env } from '@/config/env'
import { LEGAL_VERSION } from '@/content/legal/operator'
import { CODE_LENGTH, cleanCode, isCode, loginError, passwordError, safeNext } from '@/lib/auth'
import { MOCK_CODE } from '@/api/mocks'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const mode = computed<'login' | 'register'>(() => (route.meta.mode === 'register' ? 'register' : 'login'))
const next = computed(() => safeNext(route.query.next))
const otherMode = computed(() => ({ name: mode.value === 'login' ? 'register' : 'login', query: route.query.next ? { next: next.value } : {} }))

const step = ref<'form' | 'wait' | 'forgot' | 'forgot-sent'>('form')
const login = ref('')
const password = ref('')
const password2 = ref('')
const agreeTerms = ref(false)
const agreePd = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)
const touched = ref(false)
const challenge = ref<{ id: string; expiresAt: number; sent: boolean } | null>(null)
const code = ref('')
let poll: ReturnType<typeof setInterval> | undefined

const loginErr = computed(() => (mode.value === 'register' ? loginError(login.value) : login.value.trim() ? null : 'Введите логин'))
const passErr = computed(() => (mode.value === 'register' ? passwordError(password.value, login.value) : password.value ? null : 'Введите пароль'))
const pass2Err = computed(() => (mode.value === 'register' && password2.value !== password.value ? 'Пароли не совпадают' : null))
const consentOk = computed(() => mode.value === 'login' || (agreeTerms.value && agreePd.value))
const formOk = computed(() => !loginErr.value && !passErr.value && !pass2Err.value && consentOk.value)

onMounted(async () => {
  if (!user.user) await user.fetchMe()
  if (user.user && !user.user.isGuest) router.replace(next.value)
})
onBeforeUnmount(() => clearInterval(poll))
watch(mode, () => {
  step.value = 'form'
  error.value = null
  touched.value = false
})

async function done() {
  clearInterval(poll)
  await router.replace(next.value)
}

async function submit() {
  touched.value = true
  error.value = null
  if (!formOk.value || busy.value) return
  busy.value = true
  try {
    if (mode.value === 'register') {
      await user.register(login.value, password.value, { version: LEGAL_VERSION, terms: true, personalData: true })
      return await done()
    }
    const r = await user.login(login.value, password.value)
    if (r.done) return await done()
    challenge.value = { id: r.challenge, expiresAt: Date.parse(r.expiresAt), sent: r.sent }
    step.value = 'wait'
    code.value = ''
    clearInterval(poll)
    poll = setInterval(checkPoll, 2000)
  } catch (e) {
    error.value = (e as Error).message || 'Не удалось войти'
  } finally {
    busy.value = false
  }
}

function backToForm(message: string | null) {
  clearInterval(poll)
  step.value = 'form'
  challenge.value = null
  error.value = message
}

async function checkPoll() {
  if (!challenge.value || busy.value) return
  if (Date.now() > challenge.value.expiresAt) return backToForm('Время на подтверждение вышло. Войдите ещё раз.')
  try {
    if (await user.finishChallenge(challenge.value.id)) await done()
  } catch (e) {
    if (e instanceof ApiError && e.status === 410) backToForm(e.message)
  }
}

async function sendCode() {
  if (!challenge.value || !isCode(code.value) || busy.value) return
  busy.value = true
  error.value = null
  try {
    if (await user.finishChallenge(challenge.value.id, code.value)) await done()
  } catch (e) {
    if (e instanceof ApiError && e.status === 410) return backToForm(e.message)
    error.value = (e as Error).message
    code.value = ''
  } finally {
    busy.value = false
  }
}
function onCode(e: Event) {
  code.value = cleanCode((e.target as HTMLInputElement).value)
  if (code.value.length === CODE_LENGTH) sendCode()
}

async function forgot() {
  error.value = null
  if (!login.value.trim() || busy.value) return
  busy.value = true
  try {
    await api.auth.requestReset(login.value)
    step.value = 'forgot-sent'
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
```

Шаблон по шагам:
- `form`: заголовок «Вход» / «Регистрация»; подзаголовок: вход «Логин и пароль от аккаунта», регистрация «Придумайте логин и пароль. Email понадобится только для чека при оплате.»; поля Логин (`autocomplete="username"`, `autocapitalize="off"`, `maxlength="32"`), Пароль (`type="password"`, `autocomplete` `current-password` / `new-password`, `maxlength="128"`), в регистрации «Повторите пароль» и две галочки согласий (перенести из текущего шаблона); ошибки полей под полями при `touched`; общий `error` в `role="alert"`; кнопка «Войти» / «Создать аккаунт»; в режиме входа ссылка-кнопка «Забыли пароль?» (`step = 'forgot'`); ссылка на `otherMode`.
- `wait`: заголовок «Подтвердите вход в Telegram»; текст `challenge.sent ? 'Мы отправили запрос в бот. Нажмите «Подтвердить» или введите код из сообщения.' : 'Не удалось отправить сообщение в Telegram. Войдите ещё раз через минуту.'`; поле кода (`inputmode="numeric"`, `autocomplete="one-time-code"`, `@input="onCode"`); в режиме моков (`env.useMocks`) подсказка «Код в демо: {{ MOCK_CODE }}»; кнопка «Назад» → `backToForm(null)`.
- `forgot`: «Восстановление пароля», поле логина, кнопка «Отправить ссылку в Telegram»; текст «Если Telegram не был подключён, восстановить пароль можно только через поддержку.»
- `forgot-sent`: «Если к аккаунту подключён Telegram, мы отправили туда ссылку. Она действует 15 минут.» и кнопка «Ко входу».

`AuthDialog.vue`: тексты без «пароль не нужен» и «код»: pay: «Подписка привязывается к аккаунту: так запросы и история чатов будут в одном месте. Регистрация занимает минуту.»; chat: «Аккаунт хранит историю чатов и подписку. Нужны только логин и пароль. Ваш текст останется в поле ввода.»

- [ ] **Step 5: Проверки**

Run: `npx vitest run src/stores && npm run typecheck`
Expected: тесты PASS; typecheck может падать только на ResetPage/AccountPage (ещё нет) и CheckoutPage (`email`): задачи 15-16.

---

### Task 15: Плашка, окно привязки, аккаунт, сброс пароля

**Files:**
- Create: `src/components/ui/UnprotectedBanner.vue`, `src/components/ui/TelegramLinkDialog.vue`, `src/pages/AccountPage.vue`, `src/pages/ResetPage.vue`, `src/lib/dismiss.ts`
- Modify: `src/router/index.ts`, `src/pages/ChatPage.vue`, `src/components/chat/PaywallDialog.vue`, `src/pages/CheckoutPage.vue`, `src/pages/PaymentResultPage.vue`, `src/components/ui/AppHeader.vue`, `src/components/chat/ChatSidebar.vue`
- Test: `src/lib/__tests__/dismiss.spec.ts`, `src/components/__tests__/UnprotectedBanner.spec.ts`

- [ ] **Step 1: Тесты**

`src/lib/__tests__/dismiss.spec.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { dismissFor, isDismissed } from '../dismiss'

describe('скрытие на сутки', () => {
  beforeEach(() => localStorage.clear())
  it('скрыто сутки, потом снова видно', () => {
    const now = Date.parse('2026-11-16T09:00:00Z')
    expect(isDismissed('banner', now)).toBe(false)
    dismissFor('banner', 86_400_000, now)
    expect(isDismissed('banner', now + 86_399_000)).toBe(true)
    expect(isDismissed('banner', now + 86_400_001)).toBe(false)
  })
})
```

`src/components/__tests__/UnprotectedBanner.spec.ts`:

```ts
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import UnprotectedBanner from '../ui/UnprotectedBanner.vue'
import { useUserStore } from '@/stores/user'

const base = { id: 'u1', login: 'boris', email: null, name: 'boris', isGuest: false, telegram: false, tgEnabled: true, subscription: null }

describe('UnprotectedBanner', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })
  it('видна без Telegram, скрыта с Telegram, у гостя и при выключенном боте', async () => {
    const s = useUserStore()
    s.user = { ...base }
    expect(mount(UnprotectedBanner, { props: { variant: 'block' } }).text()).toMatch(/Аккаунт не защищён/)
    s.user = { ...base, telegram: true }
    expect(mount(UnprotectedBanner, { props: { variant: 'block' } }).text()).toBe('')
    s.user = { ...base, tgEnabled: false }
    expect(mount(UnprotectedBanner, { props: { variant: 'block' } }).text()).toBe('')
    s.user = { ...base, isGuest: true }
    expect(mount(UnprotectedBanner, { props: { variant: 'block' } }).text()).toBe('')
  })
  it('compact скрывается крестиком на сутки, block не скрывается', async () => {
    const s = useUserStore()
    s.user = { ...base }
    const w = mount(UnprotectedBanner, { props: { variant: 'compact' } })
    await w.get('button[aria-label="Скрыть на сутки"]').trigger('click')
    expect(w.text()).toBe('')
    expect(mount(UnprotectedBanner, { props: { variant: 'block' } }).find('button[aria-label="Скрыть на сутки"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Падает**

Run: `npx vitest run src/lib/__tests__/dismiss.spec.ts src/components/__tests__/UnprotectedBanner.spec.ts`
Expected: FAIL.

- [ ] **Step 3: `dismiss.ts`**

```ts
/** «Скрыть на N»: отметка в localStorage. Ошибки хранилища: считаем, что не скрыто. */
import { storage } from './storage'

const key = (id: string) => `ruai.dismiss.${id}`
export const dismissFor = (id: string, ms: number, now = Date.now()) => storage.set(key(id), now + ms)
export const isDismissed = (id: string, now = Date.now()) => (storage.get<number>(key(id), 0) ?? 0) > now
```

- [ ] **Step 4: `UnprotectedBanner.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/ui/Icon.vue'
import TelegramLinkDialog from '@/components/ui/TelegramLinkDialog.vue'
import { dismissFor, isDismissed } from '@/lib/dismiss'
import { useUserStore } from '@/stores/user'

/** compact: чат, скрывается на сутки; block: аккаунт; inline: строка под оплатой. */
const props = defineProps<{ variant: 'compact' | 'block' | 'inline' }>()
const user = useUserStore()
const DAY = 86_400_000
const hidden = ref(props.variant === 'compact' && isDismissed('unprotected'))
const open = ref(false)
const show = computed(() => user.showUnprotected && !hidden.value)

function hide() {
  dismissFor('unprotected', DAY)
  hidden.value = true
}
</script>

<template>
  <div v-if="show" class="ub" :class="`ub--${variant}`" role="status">
    <Icon name="shield" :size="18" class="ub__ico" />
    <p class="ub__text">
      <strong>Аккаунт не защищён:</strong> без Telegram нельзя восстановить пароль и подтвердить вход.
    </p>
    <button type="button" class="ub__go" @click="open = true">Подключить</button>
    <button v-if="variant === 'compact'" type="button" class="ub__x" aria-label="Скрыть на сутки" @click="hide"><Icon name="x" :size="16" /></button>
    <TelegramLinkDialog v-if="open" @close="open = false" />
  </div>
</template>
```

Стили: тёплый фон предупреждения из токенов сайта (`color-mix(in srgb, var(--accent) 12%, var(--bg-elev))`), рамка `1px solid color-mix(in srgb, var(--accent) 35%, transparent)`, `border-radius: var(--radius-m)`, flex с переносом, `gap: 8px 12px`, `ub--inline` без иконки и фона (просто строка `font-size: 13px`), `ub--block` с отступами 16px. Если иконки `shield` нет в `Icon.vue`, добавить её (path щита 24×24 по образцу соседних иконок).

- [ ] **Step 5: `TelegramLinkDialog.vue`**

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { api } from '@/api'
import Icon from '@/components/ui/Icon.vue'
import { useUserStore } from '@/stores/user'

const emit = defineEmits<{ close: [] }>()
const user = useUserStore()
const url = ref<string | null>(null)
const error = ref<string | null>(null)
const linked = ref(false)
let poll: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  try {
    url.value = (await api.auth.linkTelegram()).url
    // привязка завершается в боте: сайт узнаёт о ней по /auth/me
    poll = setInterval(async () => {
      await user.fetchMe()
      if (user.user?.telegram) {
        linked.value = true
        clearInterval(poll)
      }
    }, 3000)
  } catch (e) {
    error.value = (e as Error).message
  }
})
onBeforeUnmount(() => clearInterval(poll))
</script>

<template>
  <div class="tl" role="dialog" aria-modal="true" aria-label="Подключение Telegram" @click.self="emit('close')">
    <div class="tl__card">
      <button class="tl__x" aria-label="Закрыть" @click="emit('close')"><Icon name="x" /></button>
      <template v-if="linked">
        <h2>Telegram подключён</h2>
        <p>Теперь вход подтверждается в боте, а пароль можно восстановить.</p>
        <button class="btn btn--ink btn--block" @click="emit('close')">Готово</button>
      </template>
      <template v-else>
        <h2>Подключите Telegram</h2>
        <ol class="tl__steps">
          <li>Откройте бота по кнопке ниже.</li>
          <li>Нажмите «Start» (или «Запустить»).</li>
          <li>Вернитесь сюда: окно обновится само.</li>
        </ol>
        <p v-if="error" class="tl__err" role="alert">{{ error }}</p>
        <a v-else-if="url" :href="url" target="_blank" rel="noopener noreferrer" class="btn btn--ink btn--block">Открыть бота</a>
        <p v-else class="tl__wait">Готовим ссылку…</p>
        <p class="tl__note">Ссылка одноразовая и действует 10 минут.</p>
      </template>
    </div>
  </div>
</template>
```

Стили: по образцу `AuthDialog.vue` (фон-подложка, карточка `min(400px, 100%)`, анимации `fade`/`up`). Закрытие по Escape как в AuthDialog.

- [ ] **Step 6: `AccountPage.vue`**

Маршрут `/account` (`name: 'account'`), гость перенаправляется на `/login?next=/account`. Содержимое:
- шапка `AppHeader`;
- блок «Аккаунт»: логин, email для чеков (или «появится после первой оплаты»), подписка (тариф и до какого числа, как в сайдбаре);
- блок «Безопасность»:
  - `user.user.telegram`: «Telegram подключён: вход подтверждается в боте.» + кнопка «Отключить» → `api.auth.unlinkTelegram()` → текст «Подтвердите отключение в боте. После этого войдите заново.» и опрос `user.fetchMe()` раз в 3 с: когда `isGuest` стал `true`, `router.replace('/login')`;
  - иначе `<UnprotectedBanner variant="block" />`;
  - `!user.user.tgEnabled`: «Подключение Telegram временно недоступно.»;
- блок «Пароль»: поля «Текущий пароль», «Новый пароль», «Повторите», проверка `passwordError`, кнопка «Сменить пароль» → `api.auth.changePassword` → «Пароль изменён, другие устройства вышли из аккаунта.»;
- кнопка «Выйти».

```ts
const unlinkSent = ref(false)
async function unlink() {
  error.value = null
  try {
    await api.auth.unlinkTelegram()
    unlinkSent.value = true
    poll = setInterval(async () => {
      await user.fetchMe()
      if (user.isGuest) {
        clearInterval(poll)
        router.replace({ name: 'login' })
      }
    }, 3000)
  } catch (e) {
    error.value = (e as Error).message
  }
}

const cur = ref('')
const pw1 = ref('')
const pw2 = ref('')
const pwMsg = ref<string | null>(null)
const pwErr = computed(() => passwordError(pw1.value, user.user?.login ?? '') ?? (pw1.value !== pw2.value ? 'Пароли не совпадают' : null))
async function changePassword() {
  pwMsg.value = null
  if (!cur.value || pwErr.value) return
  try {
    await api.auth.changePassword(cur.value, pw1.value)
    cur.value = pw1.value = pw2.value = ''
    pwMsg.value = 'Пароль изменён, другие устройства вышли из аккаунта.'
  } catch (e) {
    pwMsg.value = (e as Error).message
  }
}
```

- [ ] **Step 7: `ResetPage.vue`**

Маршрут `/reset` (`name: 'reset'`). Токен из `location.hash.slice(1)`; сразу после чтения `history.replaceState(null, '', '/reset')`, чтобы токен не остался в адресной строке и истории. Нет токена: «Ссылка неполная. Откройте её из сообщения бота ещё раз.» Форма: новый пароль дважды; `passwordError(pw, '')` на клиенте (логин сервер проверит сам); `api.auth.confirmReset(token, pw)` → «Пароль изменён. Войдите с новым паролем.» + кнопка «Войти»; ошибка 410 → «Ссылка устарела. Запросите новую на странице входа.».

В `index.html`/SEO для `/reset` и `/account` добавить `noindex` по образцу `/chat` (в `src/seo/*` есть список страниц; эти страницы в sitemap не попадают).

- [ ] **Step 8: Размещение плашки и ссылок**

- `ChatPage.vue`: над `Composer` `<UnprotectedBanner variant="compact" />`.
- `PaywallDialog.vue`: под кнопкой оплаты `<UnprotectedBanner variant="inline" />`.
- `CheckoutPage.vue`: поле «Email для чека» (обязательное, `type="email"`, `autocomplete="email"`, начальное значение `user.user?.email ?? ''`, проверка `isEmail`, текст под полем «Сюда придёт кассовый чек»), передаётся в `checkout({ …, email })`; под кнопкой оплаты `<UnprotectedBanner variant="inline" />`.
- `PaymentResultPage.vue`: при успехе, если `user.showUnprotected`: «Подписка оплачена. Подключите Telegram, чтобы не потерять доступ.» + `<UnprotectedBanner variant="block" />`.
- `AppHeader.vue`: `hdr__email` становится `RouterLink :to="{ name: 'account' }"` с логином; если `user.showUnprotected`, рядом точка-индикатор `aria-label="Аккаунт не защищён"`.
- `ChatSidebar.vue`: `side__email` ведёт на `/account`.
- `router/index.ts`: `{ path: '/account', name: 'account', component: () => import('@/pages/AccountPage.vue') }`, `{ path: '/reset', name: 'reset', component: () => import('@/pages/ResetPage.vue') }`.

- [ ] **Step 9: Проверки**

Run: `npx vitest run && npm run lint && npm run typecheck`
Expected: всё PASS.

---

### Task 16: Админка: логин вместо email, колонка Telegram

**Files:**
- Modify: `src/admin/api/types.ts`, `src/admin/demo/dataset.ts`, `src/admin/demo/analytics.ts`, `src/admin/api/mock.ts`, `server/src/sqlRepo.ts`, `server/src/app.ts` (admin), `src/admin/views/UsersView.vue`, `PaymentsView.vue`, `ApiView.vue`, `src/admin/ui/UserDrawer.vue`
- Test: `src/admin/__tests__/dataset.spec.ts`, `server/src/sqlRepo.test.ts`

- [ ] **Step 1: Тесты**

В `dataset.spec.ts` добавить:

```ts
it('пользователи: логин, email только у плативших, фильтр «без Telegram»', () => {
  const ds = buildDataset(NOW)
  const page = usersPage(ds, { page: 1, pageSize: 500, filter: 'no_tg' })
  expect(page.rows.length).toBeGreaterThan(0)
  expect(page.rows.every((r) => !r.telegram)).toBe(true)
  expect(page.rows.every((r) => /^[a-z0-9._-]{3,32}$/.test(r.login))).toBe(true)
  const withTg = ds.users.filter((u) => u.telegram).length / ds.users.length
  expect(withTg).toBeGreaterThan(0.2)
  expect(withTg).toBeLessThan(0.8)
})
```

(имена `buildDataset`, `usersPage`, `NOW` взять из существующего файла теста).

В `server/src/sqlRepo.test.ts` в тест карточки пользователя: вставлять пользователя с `login`, `password_hash`, `tg_id = 1`; проверить `detail.user.login === 'boris'`, `detail.user.telegram === true`, что в JSON карточки нет `tg_id` и `password_hash` (`assert.doesNotMatch(JSON.stringify(detail), /tg_id|password_hash|scrypt/)`). Все существующие `INSERT INTO users (id, email, created_at)` в этом файле заменить на `INSERT INTO users (id, login, password_hash, email, created_at) VALUES (?, ?, '!', ?, ?)` с логином из части email до `@`.

- [ ] **Step 2: Реализация**

- `src/admin/api/types.ts`: в `UserRow` и `UserDetail.user` поле `email: string` → `login: string`, добавить `email: string | null`, `telegram: boolean`; в `PaymentRow`, `ApiReport.topUsers`, `PaymentsReport.expiring` поле `email` → `login`; `UserFilter` + `'no_tg'`; `EditResult` в sqlRepo без `email_taken`.
- `dataset.ts`: `DemoUser` получает `login: string`, `telegram: boolean`, `email: string | null`. Генерация: `login: \`${pick(NAMES)}.${100 + i}\``, `telegram: rnd() < 0.45`, `email`: `\`${login}@${pick(DOMAINS)}\`` только если у пользователя есть платёж, иначе `null` (выставить после генерации платежей). `emailsOf` → `loginsOf` (`Map<id, login>`), все места использования (`paymentRow`, `expiring`, `topUsers`, `userRow`) пишут `login`; поиск в `usersPage`: `u.login.includes(needle) || (u.email ?? '').includes(needle) || u.id.toLowerCase().includes(needle)`; фильтр `no_tg`: `!u.telegram`.
- `sqlRepo.ts` `loadDataset`: `SELECT id, login, email, tg_id IS NOT NULL AS telegram, created_at, blocked_at, admin_note FROM users` и `telegram: !!u.telegram`. `editUser`: email без проверки уникальности, `DELETE FROM auth_codes` убрать; `email_taken` удалить; при смене email сессии больше не удалять (email не участвует во входе).
- `app.ts` (admin, `server/src/app.ts`): `editFail` без `email_taken`.
- `mock.ts` (админка): то же без `email_taken`.
- Виды: заголовки колонок «Email» → «Логин»; `UsersView` новая колонка «Telegram» (`да` / `нет`) и фильтр-чип «Без Telegram»; `UserDrawer`: строка «Логин», «Email для чеков» (или «не указан»), «Telegram: подключён / нет»; поле правки email с подписью «для чеков».
- `src/admin/demo/analytics.ts`: `userDetail` отдаёт `login`, `email`, `telegram`.

`grep -rn "\.email" src/admin server/src/sqlRepo.ts` после правок: только `email` для чеков.

- [ ] **Step 3: Проверки**

Run: `npx vitest run src/admin && cd server && npm test && npx tsc --noEmit`
Expected: PASS.

---

### Task 17: Документы, nginx, CLAUDE.md

**Files:**
- Modify: `src/content/legal/docs.ts`, `src/content/legal/operator.ts`, `deploy/nginx/ruai.conf`, `CLAUDE.md`
- Test: `src/content/__tests__/legal.spec.ts`

- [ ] **Step 1: Тест документов**

В `legal.spec.ts` добавить:

```ts
it('документы описывают вход по логину и Telegram, без кодов из письма', () => {
  const all = JSON.stringify(DOCS)
  expect(all).toMatch(/логин/i)
  expect(all).toMatch(/Telegram/)
  expect(all).not.toMatch(/одноразовому коду, который приходит на этот адрес/)
  expect(LEGAL_VERSION).toBe('2026-11-16')
})
```

(`DOCS` - экспорт из docs.ts; взять фактическое имя из файла.)

- [ ] **Step 2: Тексты**

- `operator.ts`: `LEGAL_VERSION = '2026-11-16'`.
- `docs.ts`, оферта, строка про вход: «Вход в Сервис: по логину и паролю. Пользователь может подключить Telegram-бота Сервиса: тогда вход подтверждается в боте, а пароль восстанавливается через бота. Без подключённого Telegram восстановить пароль нельзя.»
- политика ПДн, состав данных: «Логин и хэш пароля: для входа.», «Идентификатор Telegram (если пользователь подключил бота): для подтверждения входа и восстановления пароля.», «Email: для кассовых чеков (указывается при оплате).»
- таблица целей: «Регистрация и вход | логин, хэш пароля, идентификатор Telegram, IP | согласие; договор | до удаления аккаунта».
- Отмена автопродления и возврат: «написав с адреса, указанного в аккаунте» → «написав в поддержку из аккаунта или на {email}, указав логин».

- [ ] **Step 3: nginx**

В `deploy/nginx/ruai.conf` заменить блоки `= /api/auth/code` и `= /api/auth/verify` на:

```nginx
    # вход, регистрация, сброс пароля: подбор паролей и регистраций режется здесь, точные правила считает сервер
    location ~ ^/api/auth/(login|register|reset|reset/confirm|password)$ {
        limit_req  zone=ruai_api_code burst=5 nodelay;
        client_max_body_size 4k;
        proxy_pass http://127.0.0.1:8080;
        include /etc/nginx/snippets/ruai-proxy.conf;
    }
    # опрос подтверждения входа: раз в 2 секунды
    location = /api/auth/challenge {
        limit_req  zone=ruai_api_check burst=10 nodelay;
        client_max_body_size 1k;
        proxy_pass http://127.0.0.1:8080;
        include /etc/nginx/snippets/ruai-proxy.conf;
    }
```

Зона `ruai_api_check` поднимается до `rate=40r/m` (опрос раз в 2 с = 30 в минуту). Regex-location стоит выше `^~ /api/` и ловушки `^~ /api/admin`: порядок проверить `nginx -t` на копии (CLAUDE.md, «Проверка nginx-конфига локально»), убедиться, что `/api/admin` по-прежнему 404 (ловушка `^~` приоритетнее regex).

- [ ] **Step 4: CLAUDE.md**

Заменить упоминание `/etc/ruai-api.env` и `api-setup.ts`: «ключи (OpenRouter, токен бота входа) вводит пользователь»; добавить в «Устройство»: «Вход: логин + пароль (scrypt, `server/src/api/password.ts`); Telegram-бот входа внутри ruai-api (`server/src/api/tg/`, long polling, offset в `meta`): привязка `/start <token>`, 2FA кнопкой, сброс пароля ссылкой `/reset#token`. Сессию выдаёт только `/auth/challenge` с секретом заявки, кнопки бота знают лишь `ref`.» В «Подводные камни»: «Timeweb блокирует исходящие SMTP-порты VPS: почту с сервера не отправлять.»

- [ ] **Step 5: Полная проверка**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run build:admin && cd server && npm test && npx tsc --noEmit`
Expected: всё PASS.

---

### Task 18: Проверка в браузере и выкладка

- [ ] **Step 1: Мок-превью**

`preview_start ruai-dev`: регистрация `boris` / `correct horse` → чат, видна компактная плашка; крестик скрывает её; «Подключить» → окно, через 2 с «Telegram подключён»; выход → вход → экран «Подтвердите вход в Telegram», через 2 с вход; код `000000` тоже работает; `/account`: смена пароля, отключение Telegram; checkout требует email; ширина 375 px без горизонтальной прокрутки; консоль без ошибок.

- [ ] **Step 2: Админка на моке**

`preview_start ruai-admin`: список пользователей с логинами, колонка и фильтр Telegram, карточка показывает логин, email для чеков и Telegram, в карточке нет Telegram id.

- [ ] **Step 3: Выкладка (после согласия пользователя)**

Пользователь создаёт бота в @BotFather и запускает `api-setup.ts` на сервере (ключ OpenRouter пустой, токен бота). Затем `bash deploy/deploy.sh` (env есть, значит сайт соберётся на настоящий API). Проверка на проде: регистрация, привязка через настоящего бота, вход с подтверждением, сброс пароля, `/api/admin` по-прежнему 404. Адреса-ловушки не трогать (fail2ban).

- [ ] **Step 4: Итог безопасности**

В финальном сообщении: хранение паролей и токенов, лимиты, перебор логинов, CSRF, токен бота, fail2ban, что не логируется.
