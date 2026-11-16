import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const helper = fileURLToPath(new URL('../../deploy/shared-db-permissions.sh', import.meta.url))
const gid = process.getgid?.()
if (gid === undefined) throw new Error('shared DB permission test requires a POSIX platform')

test('deploy permissions allow both services to write SQLite files through their shared group only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ruai-db-permissions-'))
  const db = join(dir, 'ruai.db')
  const wal = `${db}-wal`

  try {
    writeFileSync(db, '')
    writeFileSync(wal, '')
    chmodSync(db, 0o640)
    chmodSync(wal, 0o600)

    const result = spawnSync(
      'bash',
      ['-c', 'source "$1"; set_shared_db_permissions "$2" "$3"', 'test', helper, db, String(gid)],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)

    for (const file of [db, wal]) {
      const stat = statSync(file)
      assert.equal(stat.mode & 0o777, 0o660)
      assert.equal(stat.gid, gid)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
