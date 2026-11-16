/**
 * Мок Telegram Bot API для тестов: записывает вызовы, отвечает правдоподобными значениями,
 * отдельные методы можно переопределить (в том числе бросать TelegramError).
 */
import type { Caller, TgMessage, TgUpdate, TgUser } from './telegram.ts'

export interface Call {
  method: string
  params: Record<string, unknown>
}

type Handler = (params: Record<string, unknown>) => unknown

export class FakeTg implements Caller {
  calls: Call[] = []
  handlers: Record<string, Handler> = {}
  private msgSeq = 5000
  private threadSeq = 100

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ method, params })
    const h = this.handlers[method]
    if (h) return (await h(params)) as T
    switch (method) {
      case 'createForumTopic':
        return { message_thread_id: ++this.threadSeq, name: params.name } as T
      case 'copyMessage':
      case 'sendMessage':
        return { message_id: ++this.msgSeq } as T
      case 'copyMessages':
        return (params.message_ids as number[]).map(() => ({ message_id: ++this.msgSeq })) as T
      default:
        return true as T
    }
  }

  of(method: string): Call[] {
    return this.calls.filter((c) => c.method === method)
  }

  last(method: string): Call | undefined {
    return this.of(method).at(-1)
  }

  reset(): void {
    this.calls = []
  }
}

export const SUPPORT = -1001234567890

export const alice: TgUser = { id: 111, is_bot: false, first_name: 'Алиса', last_name: 'Иванова', username: 'alice', language_code: 'ru' }
export const bob: TgUser = { id: 222, is_bot: false, first_name: 'Боб' }
export const staffer: TgUser = { id: 900, is_bot: false, first_name: 'Оператор' }

let seq = 1
let updateSeq = 1

export function privateMsg(from: TgUser, extra: Partial<TgMessage> = {}): TgUpdate {
  return {
    update_id: updateSeq++,
    message: { message_id: seq++, date: 1, chat: { id: from.id, type: 'private' }, from, ...extra },
  }
}

export function topicMsg(thread: number, extra: Partial<TgMessage> = {}, from: TgUser = staffer): TgUpdate {
  return {
    update_id: updateSeq++,
    message: {
      message_id: seq++,
      date: 1,
      chat: { id: SUPPORT, type: 'supergroup', is_forum: true },
      from,
      message_thread_id: thread,
      is_topic_message: true,
      // так Telegram помечает сообщение в теме без явного ответа
      reply_to_message: { message_id: thread, date: 1, chat: { id: SUPPORT, type: 'supergroup' }, forum_topic_created: {} },
      ...extra,
    },
  }
}
