import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadConfig } from './config.ts'
import { hashPassword, newTotpSecret } from './crypto.ts'
import { parseSetupArgs, renderEnv } from './setup.ts'

/** Разбор env-файла как в systemd EnvironmentFile: KEY=VALUE, одинарные кавычки снимаются. */
function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line)
    if (m) out[m[1]!] = m[2]!.replace(/^'(.*)'$/, '$1')
  }
  return out
}

describe('admin-setup', () => {
  it('разбирает аргументы', () => {
    assert.deepEqual(parseSetupArgs([]), { login: 'admin', origin: null, write: null, force: false })
    assert.deepEqual(parseSetupArgs(['boss', '--origin', 'https://ru-chatgpt.com', '--write', '/etc/x.env', '--force']), {
      login: 'boss',
      origin: 'https://ru-chatgpt.com',
      write: '/etc/x.env',
      force: true,
    })
  })

  it('отклоняет опасные и неверные значения', () => {
    assert.throws(() => parseSetupArgs(['--origin', 'http://ru-chatgpt.com']), /--origin/)
    assert.throws(() => parseSetupArgs(['--origin', 'https://a.ru/path']), /--origin/)
    assert.throws(() => parseSetupArgs(['--write', 'relative.env']), /абсолютный/)
    assert.throws(() => parseSetupArgs(['bad login']), /Логин/)
    assert.throws(() => parseSetupArgs(["x'; rm"]), /Логин/)
    assert.throws(() => parseSetupArgs(['--unknown']), /Неизвестный/)
  })

  it('env-файл читается сервером без изменений', async () => {
    const hash = await hashPassword('long enough password')
    const env = renderEnv({ adminPath: 'Q'.repeat(43), login: 'boss', passwordHash: hash, totpSecret: newTotpSecret(), origin: 'https://ru-chatgpt.com' })
    const vars = parseEnv(env)
    assert.equal(vars.ADMIN_PASSWORD_HASH, hash)
    const cfg = loadConfig(vars)
    assert.equal(cfg.login, 'boss')
    assert.equal(cfg.origin, 'https://ru-chatgpt.com')
    assert.equal(cfg.dataDir, '/var/lib/ruai-admin')
  })
})
