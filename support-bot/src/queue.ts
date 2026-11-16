/**
 * Очередь отправки в Telegram: запросы в один чат идут строго по порядку (своя «полоса» на chat_id),
 * между любыми запросами — минимальный интервал, на 429 ждём retry_after, на 5xx и сбой сети —
 * экспоненциальная пауза. Пауза одной полосы (флуд-лимит группы) не задерживает ответы пользователям.
 */
import { setTimeout as delay } from 'node:timers/promises'
import { type Caller, TelegramError, errText } from './telegram.ts'
import { type Logger, silentLogger } from './log.ts'

export interface QueueOptions {
  /** Минимальный интервал между запросами, мс (глобальный лимит Telegram — около 30 в секунду). */
  minIntervalMs?: number
  maxRetries?: number
  /** Дольше этого retry_after не ждём: запрос считается неудачным. */
  maxRetryAfterSec?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  log?: Logger
}

export class SendQueue implements Caller {
  private readonly api: Caller
  private readonly minIntervalMs: number
  private readonly maxRetries: number
  private readonly maxRetryAfterSec: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number
  private readonly log: Logger
  private readonly lanes = new Map<string, Promise<unknown>>()
  private nextAt = 0

  constructor(api: Caller, opts: QueueOptions = {}) {
    this.api = api
    this.minIntervalMs = opts.minIntervalMs ?? 40
    this.maxRetries = opts.maxRetries ?? 5
    this.maxRetryAfterSec = opts.maxRetryAfterSec ?? 300
    this.sleep = opts.sleep ?? ((ms) => delay(ms))
    this.now = opts.now ?? Date.now
    this.log = opts.log ?? silentLogger
  }

  call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const lane = String(params.chat_id ?? '_')
    const prev = this.lanes.get(lane) ?? Promise.resolve()
    const run = prev.then(() => this.attempt<T>(method, params))
    const tail = run.then(
      () => undefined,
      () => undefined,
    )
    this.lanes.set(lane, tail)
    void tail.then(() => {
      if (this.lanes.get(lane) === tail) this.lanes.delete(lane)
    })
    return run
  }

  /** Дождаться, пока все запросы в очереди отработают. */
  async idle(): Promise<void> {
    while (this.lanes.size) await Promise.all([...this.lanes.values()])
  }

  private async attempt<T>(method: string, params: Record<string, unknown>): Promise<T> {
    for (let i = 0; ; i++) {
      await this.slot()
      try {
        return await this.api.call<T>(method, params)
      } catch (e) {
        const wait = this.retryDelay(e, i)
        if (wait === null) throw e
        this.log('tg_retry', { method, error: errText(e), wait_ms: wait })
        await this.sleep(wait)
      }
    }
  }

  private retryDelay(e: unknown, attempt: number): number | null {
    if (attempt >= this.maxRetries || !(e instanceof TelegramError)) return null
    if (e.code === 429) {
      const sec = e.retryAfter ?? 1
      return sec > this.maxRetryAfterSec ? null : sec * 1000 + 100
    }
    if (e.code === 0 || e.code >= 500) return Math.min(30_000, 1000 * 2 ** attempt)
    return null
  }

  private async slot(): Promise<void> {
    const now = this.now()
    const at = Math.max(now, this.nextAt)
    this.nextAt = at + this.minIntervalMs
    if (at > now) await this.sleep(at - now)
  }
}
