/**
 * Постоянное хранилище на встроенном node:sqlite: пользователь ↔ тема и соответствие сообщений
 * (чтобы ответ «в ответ на» попадал на нужное сообщение по обе стороны). Файл — в StateDirectory (0700).
 */
import { DatabaseSync } from 'node:sqlite'
import type { TgUser } from './telegram.ts'

export interface UserRecord {
  userId: number
  threadId: number | null
  firstName: string
  lastName: string | null
  username: string | null
  language: string | null
  /** Первое обращение, мс с эпохи. */
  firstSeen: number
  banned: boolean
  closed: boolean
  /** Статус обращения: new — ждёт ответа, work — в работе, done — решено. */
  status: TicketStatus
  /** Тема, которую пользователь выбрал кнопкой после /start. */
  category: string | null
}

export type TicketStatus = 'new' | 'work' | 'done'
const STATUSES: readonly TicketStatus[] = ['new', 'work', 'done']

type Row = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : null)
const num = (v: unknown) => (typeof v === 'number' ? v : null)

function toUser(r: Row): UserRecord {
  return {
    userId: Number(r.user_id),
    threadId: num(r.thread_id),
    firstName: str(r.first_name) ?? '',
    lastName: str(r.last_name),
    username: str(r.username),
    language: str(r.language),
    firstSeen: Number(r.first_seen),
    banned: r.banned === 1,
    closed: r.closed === 1,
    status: STATUSES.includes(r.status as TicketStatus) ? (r.status as TicketStatus) : 'new',
    category: str(r.category),
  }
}

/** Ограничиваем то, что приходит от Telegram, — в базу не попадёт мусор неограниченной длины. */
const clip = (s: string | undefined, n: number) => (s ? s.slice(0, n) : null)

export class SupportStore {
  private readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS users (
        user_id    INTEGER PRIMARY KEY,
        thread_id  INTEGER,
        first_name TEXT NOT NULL DEFAULT '',
        last_name  TEXT,
        username   TEXT,
        language   TEXT,
        first_seen INTEGER NOT NULL,
        banned     INTEGER NOT NULL DEFAULT 0,
        closed     INTEGER NOT NULL DEFAULT 0
      );
      CREATE UNIQUE INDEX IF NOT EXISTS users_thread ON users(thread_id) WHERE thread_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS messages (
        group_msg_id INTEGER PRIMARY KEY,
        user_id      INTEGER NOT NULL,
        user_msg_id  INTEGER NOT NULL,
        created_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_user ON messages(user_id, user_msg_id);
    `)
    this.migrate()
  }

  /** Колонки, добавленные после первой версии: база на сервере уже существует. */
  private migrate(): void {
    const cols = new Set((this.db.prepare('PRAGMA table_info(users)').all() as Row[]).map((r) => String(r.name)))
    if (!cols.has('status')) this.db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'new'")
    if (!cols.has('category')) this.db.exec('ALTER TABLE users ADD COLUMN category TEXT')
  }

  /** Создать пользователя при первом обращении или обновить имя/username/язык. */
  touchUser(u: TgUser, now: number): UserRecord {
    this.db
      .prepare(
        `INSERT INTO users (user_id, first_name, last_name, username, language, first_seen)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           first_name = excluded.first_name, last_name = excluded.last_name,
           username = excluded.username, language = excluded.language`,
      )
      .run(u.id, clip(u.first_name, 256) ?? '', clip(u.last_name, 256), clip(u.username, 64), clip(u.language_code, 16), now)
    return this.getUser(u.id) as UserRecord
  }

  getUser(userId: number): UserRecord | undefined {
    const r = this.db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId) as Row | undefined
    return r ? toUser(r) : undefined
  }

  getUserByThread(threadId: number): UserRecord | undefined {
    const r = this.db.prepare('SELECT * FROM users WHERE thread_id = ?').get(threadId) as Row | undefined
    return r ? toUser(r) : undefined
  }

  /** Привязать тему (null — тема удалена). Новая тема всегда открыта и в статусе new. */
  setThread(userId: number, threadId: number | null): void {
    if (threadId !== null) this.db.prepare('UPDATE users SET thread_id = NULL WHERE thread_id = ?').run(threadId)
    this.db.prepare("UPDATE users SET thread_id = ?, closed = 0, status = 'new' WHERE user_id = ?").run(threadId, userId)
  }

  setBanned(userId: number, banned: boolean): void {
    this.db.prepare('UPDATE users SET banned = ? WHERE user_id = ?').run(banned ? 1 : 0, userId)
  }

  setStatus(userId: number, status: TicketStatus): void {
    this.db.prepare('UPDATE users SET status = ? WHERE user_id = ?').run(status, userId)
  }

  setCategory(userId: number, category: string | null): void {
    this.db.prepare('UPDATE users SET category = ? WHERE user_id = ?').run(category, userId)
  }

  setClosed(userId: number, closed: boolean): void {
    this.db.prepare('UPDATE users SET closed = ? WHERE user_id = ?').run(closed ? 1 : 0, userId)
  }

  /** group_msg_id — сообщение в супергруппе, user_msg_id — парное ему в личке с пользователем. */
  mapMessage(groupMsgId: number, userId: number, userMsgId: number, now: number): void {
    this.db
      .prepare('INSERT OR REPLACE INTO messages (group_msg_id, user_id, user_msg_id, created_at) VALUES (?, ?, ?, ?)')
      .run(groupMsgId, userId, userMsgId, now)
  }

  findUserMsg(groupMsgId: number): { userId: number; userMsgId: number } | undefined {
    const r = this.db.prepare('SELECT user_id, user_msg_id FROM messages WHERE group_msg_id = ?').get(groupMsgId) as Row | undefined
    return r ? { userId: Number(r.user_id), userMsgId: Number(r.user_msg_id) } : undefined
  }

  findGroupMsg(userId: number, userMsgId: number): number | undefined {
    const r = this.db
      .prepare('SELECT group_msg_id FROM messages WHERE user_id = ? AND user_msg_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(userId, userMsgId) as Row | undefined
    return r ? Number(r.group_msg_id) : undefined
  }

  /** Удалить соответствия сообщений старше `before` (мс). Возвращает число удалённых строк. */
  prune(before: number): number {
    return Number(this.db.prepare('DELETE FROM messages WHERE created_at < ?').run(before).changes)
  }

  close(): void {
    this.db.close()
  }
}
