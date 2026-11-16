/**
 * Резервная копия базы: согласованный снимок через VACUUM INTO (работает при запущенном API).
 *   node scripts/backup.ts /var/lib/ruai/ruai.db /var/backups/ruai [дней=14]
 * Запускается таймером ruai-backup.timer от пользователя ruai-api. Фото (images/) не копируются.
 */
import { chmodSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const [src, dir, keepRaw] = process.argv.slice(2)
if (!src || !dir || !existsSync(src)) {
  console.error('usage: backup.ts <db> <dir> [days]')
  process.exit(1)
}
const keep = Math.max(1, Number(keepRaw) || 14)
const name = `ruai-${new Date().toISOString().slice(0, 10)}.db`
const out = join(dir, name)
rmSync(out, { force: true })
const db = new DatabaseSync(src, { readOnly: true })
db.prepare('VACUUM INTO ?').run(out)
db.close()
chmodSync(out, 0o600)
const old = readdirSync(dir)
  .filter((f) => /^ruai-\d{4}-\d{2}-\d{2}\.db$/.test(f))
  .sort()
  .slice(0, -keep)
for (const f of old) rmSync(join(dir, f))
console.log(`backup: ${name}, удалено старых: ${old.length}`)
