import { ref, shallowRef, watch, type Ref } from 'vue'
import { AdminError, adminApi, type AdminSession, type DateRange } from './api'
import { checkRange, lastDays } from './range'

/** Общее состояние админки: сессия, выбранный период, выход по 401 и по простою. */
export const session = shallowRef<AdminSession | null>(null)
const RANGE_KEY = 'ruai.admin.range'
function initialRange(): DateRange {
  try {
    const r = JSON.parse(sessionStorage.getItem(RANGE_KEY) ?? 'null')
    if (r && typeof checkRange(r.from, r.to) === 'object') return { from: r.from, to: r.to }
  } catch {
    /* нет или повреждено */
  }
  return lastDays(30)
}
/** Диапазон отчётов, общий для всех разделов; переживает перезагрузку вкладки. */
export const range = ref<DateRange>(initialRange())
watch(range, (r) => {
  try {
    sessionStorage.setItem(RANGE_KEY, JSON.stringify(r))
  } catch {
    /* приватный режим */
  }
})
export const notice = ref<string | null>(null)
/** Открытая карточка пользователя (id) - из любого раздела. */
export const userCard = ref<string | null>(null)
/** Счётчик правок: разделы перечитывают данные после действий в карточке. */
export const dataVersion = ref(0)

const IDLE_MS = 30 * 60_000 // совпадает с серверным idle-timeout
let idleTimer: ReturnType<typeof setTimeout> | undefined

export function bumpIdle() {
  clearTimeout(idleTimer)
  if (session.value) idleTimer = setTimeout(() => expire('Сессия закрыта после 30 минут без действий'), IDLE_MS)
}

export function expire(message = 'Сессия истекла, войдите снова') {
  clearTimeout(idleTimer)
  session.value = null
  notice.value = message
}

export async function logout() {
  try {
    await adminApi.logout()
  } finally {
    expire('Вы вышли из панели')
  }
}

/** 401 из любого запроса - на экран входа; остальное - текст ошибки. */
export function handle(e: unknown): string | null {
  if (e instanceof AdminError && e.status === 401) {
    expire()
    return null
  }
  return (e as Error).message || 'Не удалось загрузить'
}

/** Загружает отчёт при входе и при смене источника (по умолчанию - периода). */
export function useReport<T, S = DateRange>(load: (s: S) => Promise<T>, source: Ref<S> = range as unknown as Ref<S>) {
  const data = shallowRef<T | null>(null)
  const error = ref<string | null>(null)
  const loading = ref(false)
  let seq = 0
  async function run() {
    const my = ++seq
    loading.value = true
    error.value = null
    try {
      const res = await load(source.value)
      if (my === seq) data.value = res
    } catch (e) {
      if (my === seq) error.value = handle(e)
    } finally {
      if (my === seq) loading.value = false
    }
  }
  watch(source, run, { immediate: true, deep: true })
  watch(dataVersion, run)
  return { data, error, loading, reload: run }
}
