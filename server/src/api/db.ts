/**
 * База сайта: один файл SQLite (WAL). Пишут два процесса - ruai-api и ruai-admin,
 * поэтому busy_timeout и короткие транзакции BEGIN IMMEDIATE.
 * Миграции - по номеру в meta.schema; только добавляем, ничего не переписываем.
 */
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { randomBytes } from 'node:crypto'

export type Row = Record<string, unknown>

export const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_active_at INTEGER,
    blocked_at INTEGER
  );
  CREATE TABLE consents (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    version TEXT NOT NULL,
    ip TEXT NOT NULL,
    ua TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX consents_user ON consents(user_id);
  CREATE TABLE auth_codes (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    intent TEXT NOT NULL,
    consent TEXT,
    ip TEXT NOT NULL,
    ua TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip TEXT NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);
  CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    provider_id TEXT,
    tier TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL,
    repeat INTEGER NOT NULL DEFAULT 0,
    auto_renew INTEGER NOT NULL DEFAULT 0,
    consent TEXT,
    created_at INTEGER NOT NULL,
    paid_at INTEGER,
    refunded_at INTEGER,
    UNIQUE(provider, provider_id)
  );
  CREATE INDEX payments_user ON payments(user_id);
  CREATE INDEX payments_created ON payments(created_at);
  CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payment_id TEXT REFERENCES payments(id) ON DELETE SET NULL,
    source TEXT NOT NULL,
    tier TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    total_limit INTEGER NOT NULL,
    daily_limit INTEGER NOT NULL,
    total_used INTEGER NOT NULL DEFAULT 0,
    daily_used INTEGER NOT NULL DEFAULT 0,
    daily_key TEXT NOT NULL DEFAULT '',
    gen_used INTEGER NOT NULL DEFAULT 0,
    spent_usd REAL NOT NULL DEFAULT 0,
    budget_rub REAL NOT NULL,
    auto_renew INTEGER NOT NULL DEFAULT 0,
    canceled_at INTEGER
  );
  CREATE INDEX subs_user ON subscriptions(user_id, expires_at);
  CREATE TABLE chats (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX chats_user ON chats(user_id, updated_at);
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'done',
    truncated INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX messages_chat ON messages(chat_id, created_at);
  CREATE TABLE images (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
    message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    mime TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX images_user ON images(user_id, created_at);
  CREATE INDEX images_message ON images(message_id);
  CREATE TABLE usage_events (
    id INTEGER PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    sub_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    tier TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    model TEXT NOT NULL,
    day_key TEXT NOT NULL,
    status TEXT NOT NULL,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    error_code TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX usage_user ON usage_events(user_id, created_at);
  CREATE INDEX usage_created ON usage_events(created_at);
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // 2: заметка администратора о пользователе (видна только в панели)
  `ALTER TABLE users ADD COLUMN admin_note TEXT;`,
  // 3: вход по логину и паролю, Telegram-2FA. users пересоздаётся (в SQLite нельзя снять NOT NULL с email).
  // Выполняется с выключенными внешними ключами (см. REBUILDS): иначе DROP TABLE users удалит чаты каскадом.
  // Старые аккаунты получают логин из части email до @ и пароль «!»: войти можно только после сброса.
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
      CASE WHEN EXISTS (
        SELECT 1 FROM users o
        WHERE lower(substr(o.email, 1, instr(o.email, '@') - 1)) = lower(substr(u.email, 1, instr(u.email, '@') - 1))
          AND (o.created_at < u.created_at OR (o.created_at = u.created_at AND o.id < u.id))
      )
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
  // 4: событие расхода знает свой вопрос и ответ (лента запросов в админке).
  // Старые события связываются по времени: сообщение пользователя пишется сразу после резерва,
  // а параллельных запросов у одного пользователя нет (busy). Ответ - первый ответ модели
  // в том же чате после вопроса и до следующего вопроса; только для удачных запросов.
  `
  ALTER TABLE usage_events ADD COLUMN chat_id TEXT;
  ALTER TABLE usage_events ADD COLUMN message_id TEXT;
  ALTER TABLE usage_events ADD COLUMN reply_id TEXT;
  CREATE INDEX usage_user_seq ON usage_events(user_id, id);
  UPDATE usage_events SET message_id = (
    SELECT m.id FROM messages m JOIN chats c ON c.id = m.chat_id
    WHERE c.user_id = usage_events.user_id AND m.role = 'user'
      AND m.created_at BETWEEN usage_events.created_at AND usage_events.created_at + 5000
      AND NOT EXISTS (
        SELECT 1 FROM usage_events e2 WHERE e2.user_id = usage_events.user_id
          AND (e2.created_at > usage_events.created_at OR (e2.created_at = usage_events.created_at AND e2.id > usage_events.id))
          AND e2.created_at <= m.created_at
      )
    ORDER BY m.created_at, m.rowid LIMIT 1
  ) WHERE user_id IS NOT NULL;
  UPDATE usage_events SET chat_id = (SELECT chat_id FROM messages WHERE id = usage_events.message_id) WHERE message_id IS NOT NULL;
  UPDATE usage_events SET reply_id = (
    SELECT a.id FROM messages q JOIN messages a ON a.chat_id = q.chat_id AND a.role = 'assistant'
      AND (a.created_at > q.created_at OR (a.created_at = q.created_at AND a.rowid > q.rowid))
    WHERE q.id = usage_events.message_id
      AND NOT EXISTS (
        SELECT 1 FROM messages n WHERE n.chat_id = q.chat_id AND n.role = 'user' AND n.id != q.id
          AND (n.created_at > q.created_at OR (n.created_at = q.created_at AND n.rowid > q.rowid))
          AND (n.created_at < a.created_at OR (n.created_at = a.created_at AND n.rowid < a.rowid))
      )
    ORDER BY a.created_at, a.rowid LIMIT 1
  ) WHERE status = 'ok' AND message_id IS NOT NULL;
  `,
]

/** Миграции, пересоздающие таблицы: PRAGMA foreign_keys внутри транзакции не меняется, выключаем до неё. */
const REBUILDS = new Set([2])

export class Db {
  readonly sql: DatabaseSync

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o770 })
    this.sql = new DatabaseSync(file)
    this.sql.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;')
    this.migrate()
  }

  private migrate() {
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    const version = () => Number((this.get('SELECT value FROM meta WHERE key = ?', 'schema')?.value as string | undefined) ?? 0)
    for (let v = version(); v < MIGRATIONS.length; v++) {
      const rebuild = REBUILDS.has(v)
      if (rebuild) this.sql.exec('PRAGMA foreign_keys = OFF')
      try {
        this.tx(() => {
          // базу открывают два процесса: версию перечитываем под блокировкой записи
          if (version() > v) return
          this.sql.exec(MIGRATIONS[v]!)
          if (rebuild && this.all('PRAGMA foreign_key_check').length) throw new Error(`migration ${v + 1}: foreign key check failed`)
          this.run('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', 'schema', String(v + 1))
        })
      } finally {
        if (rebuild) this.sql.exec('PRAGMA foreign_keys = ON')
      }
    }
  }

  get<T = Row>(q: string, ...p: SQLInputValue[]): T | undefined {
    return this.sql.prepare(q).get(...p) as T | undefined
  }
  all<T = Row>(q: string, ...p: SQLInputValue[]): T[] {
    return this.sql.prepare(q).all(...p) as T[]
  }
  run(q: string, ...p: SQLInputValue[]) {
    return this.sql.prepare(q).run(...p)
  }

  /** Транзакция с блокировкой записи сразу (проверка лимита и списание - атомарно). */
  tx<T>(fn: () => T): T {
    if (this.sql.isTransaction) return fn()
    this.sql.exec('BEGIN IMMEDIATE')
    try {
      const r = fn()
      this.sql.exec('COMMIT')
      return r
    } catch (e) {
      this.sql.exec('ROLLBACK')
      throw e
    }
  }

  close() {
    this.sql.close()
  }
}

/** Непредсказуемый id: по нему нельзя перебрать чужие чаты и картинки. */
export const newId = (prefix: string) => `${prefix}_${randomBytes(15).toString('base64url')}`
