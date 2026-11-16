/** «Скрыть на время»: отметка в localStorage. Ошибки хранилища: считаем, что не скрыто. */
import { storage } from './storage'

const key = (id: string) => `ruai.dismiss.${id}`

export const dismissFor = (id: string, ms: number, now = Date.now()) => storage.set(key(id), now + ms)

export const isDismissed = (id: string, now = Date.now()) => {
  const until = storage.get<unknown>(key(id), 0)
  return typeof until === 'number' && until > now
}
