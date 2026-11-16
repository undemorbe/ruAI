import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { Db, MIGRATIONS } from './db.ts'

test('миграция 3: users с логином, старые строки без пароля, данные и внешние ключи целы', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ruai-m3-')), 'db.sqlite')
  // база версии 2 с двумя пользователями с одинаковой частью до @
  const raw = new DatabaseSync(file)
  raw.exec('PRAGMA foreign_keys = ON')
  raw.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  raw.exec(MIGRATIONS[0]!)
  raw.exec(MIGRATIONS[1]!)
  raw.exec("INSERT INTO meta VALUES ('schema', '2')")
  raw.exec("INSERT INTO users (id, email, created_at, admin_note) VALUES ('u_1', 'Boris@a.ru', 1, 'n'), ('u_2', 'boris@b.ru', 2, NULL)")
  raw.exec("INSERT INTO chats (id, user_id, title, created_at, updated_at) VALUES ('c_1', 'u_2', 't', 1, 1)")
  raw.exec("INSERT INTO sessions (id, user_id, created_at, last_seen, expires_at, ip) VALUES ('s', 'u_1', 1, 1, 9, 'ip')")
  raw.close()

  const db = new Db(file)
  const rows = db.all('SELECT id, login, email, password_hash, tg_id, admin_note FROM users ORDER BY id').map((r) => ({ ...r }))
  assert.deepEqual(rows, [
    { id: 'u_1', login: 'boris', email: 'Boris@a.ru', password_hash: '!', tg_id: null, admin_note: 'n' },
    { id: 'u_2', login: 'boris_u_2', email: 'boris@b.ru', password_hash: '!', tg_id: null, admin_note: null },
  ])
  assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM chats')!.n, 1, 'пересоздание users не удалило чаты каскадом')
  assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sessions')!.n, 1)
  assert.equal(db.all('PRAGMA foreign_key_check').length, 0)
  assert.equal(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys, 1, 'внешние ключи снова включены')
  assert.equal(db.get("SELECT name FROM sqlite_master WHERE name = 'auth_codes'"), undefined)
  for (const t of ['tg_links', 'login_challenges', 'password_resets']) assert.ok(db.get('SELECT name FROM sqlite_master WHERE name = ?', t), t)
  assert.ok(db.all('PRAGMA table_info(payments)').some((c) => c.name === 'receipt_email'))
  // удаление пользователя по-прежнему чистит его данные
  db.run("DELETE FROM users WHERE id = 'u_2'")
  assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM chats')!.n, 0)
  db.sql.close()
})

test('новая база сразу на последней версии, логин уникален', () => {
  const db = new Db(':memory:')
  db.run("INSERT INTO users (id, login, password_hash, created_at) VALUES ('u_1', 'boris', '!', 1)")
  assert.throws(() => db.run("INSERT INTO users (id, login, password_hash, created_at) VALUES ('u_2', 'boris', '!', 1)"), /UNIQUE/)
  assert.throws(() => db.run("INSERT INTO users (id, password_hash, created_at) VALUES ('u_3', '!', 1)"), /NOT NULL/)
})
