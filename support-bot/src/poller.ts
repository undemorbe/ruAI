/**
 * Long polling getUpdates. Получаем только message, my_chat_member и callback_query (кнопки) —
 * остального бот не обрабатывает.
 */
import { setTimeout as delay } from 'node:timers/promises'
import type { Logger } from './log.ts'
import { type TelegramApi, type TgUpdate, TelegramError, errText } from './telegram.ts'

export const ALLOWED_UPDATES = ['message', 'my_chat_member', 'callback_query']

export interface PollOptions {
  signal: AbortSignal
  log: Logger
  timeoutSec?: number
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

const abortableSleep = (ms: number, signal: AbortSignal) => delay(ms, undefined, { signal }).catch(() => undefined)

/** Крутится, пока не сработает signal. Неверный токен (401) — фатальная ошибка. */
export async function pollUpdates(api: TelegramApi, onUpdate: (u: TgUpdate) => void, opts: PollOptions): Promise<void> {
  const { signal, log } = opts
  const timeout = opts.timeoutSec ?? 30
  const sleep = opts.sleep ?? abortableSleep
  let offset = 0
  let failures = 0
  while (!signal.aborted) {
    let updates: TgUpdate[]
    try {
      updates = await api.call<TgUpdate[]>(
        'getUpdates',
        { offset, timeout, allowed_updates: ALLOWED_UPDATES },
        { signal, timeoutMs: (timeout + 15) * 1000 },
      )
      failures = 0
    } catch (e) {
      if (signal.aborted) break
      if (e instanceof TelegramError && e.code === 401) throw new Error('Telegram отклонил BOT_TOKEN (401)')
      // 409 — запущен второй экземпляр или висит webhook
      const wait = e instanceof TelegramError && e.code === 409 ? 5000 : Math.min(30_000, 1000 * 2 ** failures++)
      log('poll_error', { error: errText(e), wait_ms: wait })
      await sleep(wait, signal)
      continue
    }
    for (const u of updates) {
      offset = Math.max(offset, u.update_id + 1)
      try {
        onUpdate(u)
      } catch (e) {
        log('update_error', { error: errText(e) })
      }
    }
  }
}
