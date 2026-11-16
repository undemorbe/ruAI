/** Плановая уборка: просроченные сессии, ссылки и заявки входа, брошенные загрузки (фото не отправили за сутки). */
import type { Db } from './db.ts'
import type { ImageFiles } from './images.ts'

export function sweep(db: Db, files: ImageFiles, now: number) {
  db.run('DELETE FROM sessions WHERE expires_at <= ?', now)
  db.run('DELETE FROM tg_links WHERE expires_at <= ?', now)
  db.run('DELETE FROM login_challenges WHERE expires_at <= ?', now)
  db.run('DELETE FROM password_resets WHERE expires_at <= ? OR used_at IS NOT NULL', now)
  const orphans = db.all<{ id: string }>("SELECT id FROM images WHERE message_id IS NULL AND source = 'upload' AND created_at < ?", now - 86_400_000)
  for (const o of orphans) {
    db.run('DELETE FROM images WHERE id = ?', o.id)
    files.remove(o.id)
  }
  return { orphans: orphans.length }
}

/** Удаление аккаунта: строки каскадом в БД, файлы картинок с диска. Платежи и расходы остаются обезличенными. */
export function deleteUser(db: Db, files: ImageFiles, userId: string): boolean {
  const ids = db.all<{ id: string }>('SELECT id FROM images WHERE user_id = ?', userId)
  const r = db.run('DELETE FROM users WHERE id = ?', userId)
  for (const i of ids) files.remove(i.id)
  return r.changes > 0
}
