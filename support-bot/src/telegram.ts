/**
 * Минимальный клиент Telegram Bot API поверх fetch, без зависимостей, и нужные боту типы.
 * Токен есть только в URL запроса; из текстов ошибок он вырезается.
 */

export interface TgUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface TgChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  is_forum?: boolean
}

export interface TgMessage {
  message_id: number
  date: number
  chat: TgChat
  from?: TgUser
  sender_chat?: TgChat
  message_thread_id?: number
  is_topic_message?: boolean
  media_group_id?: string
  reply_to_message?: TgMessage
  text?: string
  caption?: string
  photo?: unknown[]
  document?: unknown
  voice?: unknown
  video?: unknown
  sticker?: unknown
  audio?: unknown
  video_note?: unknown
  animation?: unknown
  forum_topic_created?: unknown
  migrate_to_chat_id?: number
  [key: string]: unknown
}

export interface TgChatMemberUpdated {
  chat: TgChat
  from: TgUser
  new_chat_member: { status: string; user: TgUser }
}

export interface TgCallbackQuery {
  id: string
  from: TgUser
  message?: TgMessage
  data?: string
}

export interface TgUpdate {
  update_id: number
  message?: TgMessage
  my_chat_member?: TgChatMemberUpdated
  callback_query?: TgCallbackQuery
}

export class TelegramError extends Error {
  /** Код ошибки Bot API; 0 — сбой сети или таймаут. */
  readonly code: number
  readonly description: string
  readonly retryAfter: number | undefined

  constructor(code: number, description: string, retryAfter?: number) {
    super(`Telegram ${code}: ${description}`)
    this.name = 'TelegramError'
    this.code = code
    this.description = description
    this.retryAfter = retryAfter
  }
}

export interface CallOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

/** То, через что бот отправляет запросы: сам клиент или очередь с повторами поверх него. */
export interface Caller {
  call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>
}

export interface TelegramApi {
  call<T = unknown>(method: string, params?: Record<string, unknown>, opts?: CallOptions): Promise<T>
}

interface ApiResponse {
  ok?: boolean
  result?: unknown
  error_code?: number
  description?: string
  parameters?: { retry_after?: number }
}

export function errText(e: unknown): string {
  if (e instanceof TelegramError) return `${e.code} ${e.description}`
  if (e instanceof Error) {
    const cause = (e as Error & { cause?: { code?: unknown } }).cause
    return typeof cause?.code === 'string' ? `${e.message} (${cause.code})` : e.message
  }
  return String(e)
}

export function createApi(token: string, base = 'https://api.telegram.org', fetchImpl: typeof fetch = fetch): TelegramApi {
  const root = `${base.replace(/\/+$/, '')}/bot${token}/`
  const hide = (s: string) => (token ? s.split(token).join('***') : s)

  return {
    async call<T = unknown>(method: string, params: Record<string, unknown> = {}, opts: CallOptions = {}): Promise<T> {
      const timeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000)
      const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
      let res: Response
      try {
        res = await fetchImpl(root + method, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params),
          signal,
        })
      } catch (e) {
        if (opts.signal?.aborted) throw e
        throw new TelegramError(0, hide(`сеть: ${errText(e)}`))
      }
      let body: ApiResponse
      try {
        body = (await res.json()) as ApiResponse
      } catch {
        throw new TelegramError(res.status, `HTTP ${res.status}: ответ не JSON`)
      }
      if (body.ok) return body.result as T
      throw new TelegramError(body.error_code ?? res.status, hide(body.description ?? 'без описания'), body.parameters?.retry_after)
    },
  }
}

/** Тема форума удалена или id темы больше не действителен. */
export function isThreadGone(e: unknown): boolean {
  return e instanceof TelegramError && e.code === 400 && /message thread not found|TOPIC_DELETED|TOPIC_ID_INVALID/i.test(e.description)
}

export function isTopicClosed(e: unknown): boolean {
  return e instanceof TelegramError && e.code === 400 && /TOPIC_CLOSED/i.test(e.description)
}

export function isNotModified(e: unknown): boolean {
  return e instanceof TelegramError && e.code === 400 && /NOT_MODIFIED/i.test(e.description)
}

/** Пользователь заблокировал бота или удалил аккаунт. */
export function isBlockedByUser(e: unknown): boolean {
  return e instanceof TelegramError && e.code === 403
}
