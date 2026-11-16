/**
 * Сообщения для модели с картинками. Тариф с изображениями видит фото текущего сообщения
 * и несколько последних картинок чата (загруженные и созданные), чтобы уточняющий вопрос
 * («а что слева?», «сделай фон синим») относился к той же картинке.
 */
import type { LlmMessage, Part } from './openrouter.ts'

/** Сколько картинок из прошлых сообщений уходит в модель (свежие). */
export const PRIOR_IMAGES = 2

export interface CtxMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface CtxImage {
  id: string
  messageId: string
  createdAt: number
}

/**
 * Какие картинки отправить: все фото текущего сообщения и до `prior` последних из сообщений,
 * попавших в контекст. Возвращает id картинок по сообщениям, в порядке создания.
 */
export function pickContextImages(images: CtxImage[], ctxIds: string[], currentId: string, prior = PRIOR_IMAGES): Map<string, string[]> {
  const inCtx = new Set(ctxIds)
  const current = images.filter((i) => i.messageId === currentId)
  const older = images
    .filter((i) => i.messageId !== currentId && inCtx.has(i.messageId))
    .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1))
    .slice(0, prior)
  const out = new Map<string, string[]>()
  for (const i of [...older, ...current].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))) {
    out.set(i.messageId, [...(out.get(i.messageId) ?? []), i.id])
  }
  return out
}

/**
 * Собирает сообщения: фото пользователя идут частями его сообщения; созданные моделью
 * картинки (у ответа ассистента частей-картинок быть не может) идут отдельным сообщением
 * пользователя сразу после ответа. Пустые сообщения без картинок пропускаются.
 * `fallback`: текст для последнего сообщения, если пользователь прислал только фото.
 */
export function assembleMessages(ctx: CtxMessage[], parts: Map<string, Part[]>, fallback: string): LlmMessage[] {
  const out: LlmMessage[] = []
  ctx.forEach((m, i) => {
    const imgs = parts.get(m.id) ?? []
    const last = i === ctx.length - 1
    if (m.role === 'user') {
      if (imgs.length) out.push({ role: 'user', content: [{ type: 'text', text: m.content || (last ? fallback : 'Фото') }, ...imgs] })
      else if (m.content) out.push({ role: 'user', content: m.content })
      return
    }
    if (m.content || imgs.length) out.push({ role: 'assistant', content: m.content || 'Изображение создано.' })
    if (imgs.length) out.push({ role: 'user', content: [{ type: 'text', text: 'Изображение, которое ты создал в ответе выше.' }, ...imgs] })
  })
  if (!out.length || out[out.length - 1]!.role !== 'user') out.push({ role: 'user', content: fallback })
  return out
}
