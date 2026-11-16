/** Узкий клиент Telegram Bot API: только то, что нужно входу. Токен не попадает в ошибки и логи. */

export type TgButton = { text: string; callback_data: string } | { text: string; url: string }

export interface TgUpdate {
  update_id: number
  message?: { message_id: number; chat: { id: number; type: string }; from?: { id: number }; text?: string }
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { message_id: number; chat: { id: number } } }
}

export interface TgApi {
  getMe(): Promise<{ username: string }>
  deleteWebhook(): Promise<void>
  getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal): Promise<TgUpdate[]>
  sendMessage(chatId: number, text: string, buttons?: TgButton[][]): Promise<{ message_id: number }>
  editMessageText(chatId: number, messageId: number, text: string): Promise<void>
  answerCallbackQuery(id: string, text?: string): Promise<void>
}

export class TgError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function httpTgApi(token: string, f: typeof fetch = fetch): TgApi {
  const base = `https://api.telegram.org/bot${token}/`
  async function call<T>(method: string, body: object, signal?: AbortSignal): Promise<T> {
    let res: Response
    try {
      res = await f(base + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(15_000),
      })
    } catch (e) {
      // в тексте сетевой ошибки бывает URL с токеном: наружу только имя ошибки
      throw new TgError(0, `telegram ${method}: ${(e as Error).name}`)
    }
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: unknown; error_code?: number }
    if (!data.ok) throw new TgError(data.error_code ?? res.status, `telegram ${method}: ${String(data.description ?? res.status).slice(0, 200)}`)
    return data.result as T
  }
  const markup = (buttons?: TgButton[][]) => (buttons ? { reply_markup: { inline_keyboard: buttons } } : {})
  return {
    getMe: () => call('getMe', {}),
    deleteWebhook: async () => {
      await call('deleteWebhook', { drop_pending_updates: false })
    },
    getUpdates: (offset, timeoutSec, signal) => call('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message', 'callback_query'] }, signal),
    sendMessage: (chatId, text, buttons) => call('sendMessage', { chat_id: chatId, text, ...markup(buttons), link_preview_options: { is_disabled: true } }),
    editMessageText: async (chatId, messageId, text) => {
      await call('editMessageText', { chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: [] } })
    },
    answerCallbackQuery: async (id, text) => {
      await call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) })
    },
  }
}
