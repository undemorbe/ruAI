/** Long polling getUpdates. offset в meta: после перезапуска старые апдейты повторно не обрабатываются. */
import type { Db } from '../db.ts'
import type { TgApi, TgUpdate } from './api.ts'

const KEY = 'tg_offset'

export async function pollOnce(db: Db, api: TgApi, handle: (u: TgUpdate) => Promise<void>, signal?: AbortSignal, timeoutSec = 30) {
  const offset = Number(db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', KEY)?.value ?? 0)
  const updates = await api.getUpdates(offset, timeoutSec, signal)
  for (const u of updates) {
    try {
      await handle(u)
    } catch (e) {
      process.stderr.write(`tg update failed: ${(e as Error).message.slice(0, 200)}\n`)
    }
    // offset двигаем и после сбоя: один кривой апдейт не должен зациклить бота
    db.run('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', KEY, String(u.update_id + 1))
  }
}

/** Бесконечный цикл с паузой после ошибки сети. Останавливается по signal. */
export async function runPolling(db: Db, api: TgApi, handle: (u: TgUpdate) => Promise<void>, signal: AbortSignal, pauseMs = 5000) {
  while (!signal.aborted) {
    try {
      await pollOnce(db, api, handle, AbortSignal.any([signal, AbortSignal.timeout(40_000)]))
    } catch (e) {
      if (signal.aborted) return
      process.stderr.write(`tg poll: ${(e as Error).message.slice(0, 200)}\n`)
      await new Promise((r) => setTimeout(r, pauseMs))
    }
  }
}
