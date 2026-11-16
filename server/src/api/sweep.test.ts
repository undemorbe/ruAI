import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sweep } from './sweep.ts'
import { setup } from './testkit.ts'

test('уборка: просроченные ссылки, заявки и сбросы уходят, живые остаются', async () => {
  const t = setup()
  const id = await t.register()
  const now = t.clock.t
  const add = (table: string, key: string, exp: number, extra = '') =>
    table === 'login_challenges'
      ? t.db.run(`INSERT INTO login_challenges (id, ref, user_id, kind, code_hash, ip, ua, created_at, expires_at) VALUES (?, ?, ?, 'login', 'h', 'ip', 'ua', 0, ?)`, key, key, id, exp)
      : t.db.run(`INSERT INTO ${table} (token_hash, user_id, expires_at${extra ? ', used_at' : ''}) VALUES (?, ?, ?${extra ? ', 1' : ''})`, key, id, exp)
  add('login_challenges', 'old', now - 1)
  add('login_challenges', 'live', now + 1000)
  add('tg_links', 'old', now - 1)
  add('password_resets', 'old', now - 1)
  add('password_resets', 'used', now + 1000, 'used')
  add('password_resets', 'live', now + 1000)
  sweep(t.db, t.files, now)
  const keys = (q: string) => t.db.all<{ k: string }>(q).map((r) => r.k)
  assert.deepEqual(keys('SELECT id AS k FROM login_challenges'), ['live'])
  assert.deepEqual(keys('SELECT token_hash AS k FROM tg_links'), [])
  assert.deepEqual(keys('SELECT token_hash AS k FROM password_resets'), ['live'])
})
