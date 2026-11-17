/**
 * Лента запросов к модели для админки: вопрос, ответ, картинки и цена каждого запроса.
 * Читает общую базу сайта (usage_events связаны с сообщениями миграцией 4).
 */
import type { AdminSettings, RequestEntry, RequestImage, RequestsPage, RequestsQuery } from '../../src/admin/api/types.ts'
import type { PlanTier } from '../../src/api/types.ts'
import type { Db } from './api/db.ts'
import type { ImageFiles } from './api/images.ts'

export const REQUESTS_PAGE = 30
/** Длинные тексты в панели обрезаются: полный ответ модели может быть большим. */
export const CLIP = 20_000

interface Row {
  id: number
  created_at: number
  user_id: string | null
  login: string | null
  kind: RequestEntry['kind']
  tier: PlanTier
  model: string
  status: RequestEntry['status']
  error_code: string | null
  tokens_in: number
  tokens_out: number
  cost_usd: number
  chat_id: string | null
  chat_title: string | null
  message_id: string | null
  reply_id: string | null
  prompt: string | null
  answer: string | null
  truncated: number | null
}

export function requestsPage(db: Db, q: RequestsQuery, s: AdminSettings): RequestsPage {
  const where: string[] = []
  const args: (string | number)[] = []
  if (q.userId) {
    where.push('e.user_id = ?')
    args.push(q.userId)
  }
  if (q.before) {
    where.push('e.id < ?')
    args.push(q.before)
  }
  const f = q.filter ?? 'all'
  if (f === 'error') where.push("e.status = 'error'")
  else if (f !== 'all') {
    where.push('e.kind = ?')
    args.push(f)
  }
  const rows = db.all<Row>(
    `SELECT e.id, e.created_at, e.user_id, u.login, e.kind, e.tier, e.model, e.status, e.error_code,
       e.tokens_in, e.tokens_out, e.cost_usd, e.chat_id, c.title AS chat_title, e.message_id, e.reply_id,
       substr(qm.content, 1, ${CLIP + 1}) AS prompt, substr(am.content, 1, ${CLIP + 1}) AS answer, am.truncated
     FROM usage_events e
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN chats c ON c.id = e.chat_id
     LEFT JOIN messages qm ON qm.id = e.message_id
     LEFT JOIN messages am ON am.id = e.reply_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.id DESC LIMIT ?`,
    ...args,
    REQUESTS_PAGE + 1,
  )
  const page = rows.slice(0, REQUESTS_PAGE)
  const msgIds = page.flatMap((r) => [r.message_id, r.reply_id]).filter((x): x is string => !!x)
  const pics = new Map<string, RequestImage[]>()
  if (msgIds.length) {
    const imgs = db.all<{ id: string; message_id: string; width: number; height: number }>(
      `SELECT id, message_id, width, height FROM images WHERE message_id IN (${msgIds.map(() => '?').join(',')}) ORDER BY created_at, id`,
      ...msgIds,
    )
    for (const i of imgs) pics.set(i.message_id, [...(pics.get(i.message_id) ?? []), { id: i.id, width: i.width, height: i.height }])
  }
  const clip = (t: string | null) => (t !== null && t.length > CLIP ? t.slice(0, CLIP) : t)
  const items = page.map(
    (r): RequestEntry => ({
      id: r.id,
      at: new Date(r.created_at).toISOString(),
      userId: r.user_id ?? 'deleted',
      login: r.login ?? 'удалён',
      kind: r.kind,
      tier: r.tier,
      model: r.model,
      status: r.status,
      errorCode: r.error_code,
      tokensIn: r.tokens_in,
      tokensOut: r.tokens_out,
      costUsd: r.cost_usd,
      costRub: Math.round(r.cost_usd * s.usdRub * 100) / 100,
      chatId: r.chat_id,
      chatTitle: r.chat_title,
      prompt: clip(r.prompt),
      answer: clip(r.answer),
      clipped: (r.prompt?.length ?? 0) > CLIP || (r.answer?.length ?? 0) > CLIP,
      truncated: !!r.truncated,
      photos: (r.message_id && pics.get(r.message_id)) || [],
      generated: (r.reply_id && pics.get(r.reply_id)) || [],
    }),
  )
  return { items, next: rows.length > REQUESTS_PAGE ? page.at(-1)!.id : null }
}

/** Файл картинки для панели: тип из БД, байты с диска. */
export function requestImage(db: Db, files: ImageFiles, id: string): { mime: string; data: Buffer } | null {
  const row = db.get<{ mime: string }>('SELECT mime FROM images WHERE id = ?', id)
  const data = row ? files.read(id) : null
  return row && data ? { mime: row.mime, data } : null
}
