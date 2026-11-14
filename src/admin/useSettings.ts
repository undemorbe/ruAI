import { computed, ref, shallowRef } from 'vue'
import { adminApi, type AdminSettings } from './api'
import { handle } from './state'

/** Черновик настроек: правка → «Сохранить». Сервер проверяет значения повторно. */
export function useSettings() {
  const saved = shallowRef<AdminSettings | null>(null)
  const draft = ref<AdminSettings | null>(null)
  const error = ref<string | null>(null)
  const status = ref<string | null>(null)
  const busy = ref(false)

  const clone = (s: AdminSettings) => JSON.parse(JSON.stringify(s)) as AdminSettings
  const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== JSON.stringify(saved.value))

  adminApi
    .settings()
    .then((s) => {
      saved.value = s
      draft.value = clone(s)
    })
    .catch((e) => (error.value = handle(e)))

  function invalid(s: AdminSettings): string | null {
    const ints = [...Object.values(s.budgetsRub.text), ...Object.values(s.budgetsRub.media)]
    if (ints.some((n) => !Number.isFinite(n) || n < 0)) return 'Бюджет — неотрицательное число'
    if (Object.values(s.generationLimits).some((n) => n !== null && (!Number.isInteger(n) || n < 0))) return 'Лимит генераций — целое число ≥ 0 или пусто'
    if (!(s.usdRub > 0 && s.usdRub < 1000)) return 'Курс доллара указан неверно'
    return null
  }

  async function save() {
    if (!draft.value || busy.value) return
    const bad = invalid(draft.value)
    if (bad) {
      error.value = bad
      return
    }
    busy.value = true
    error.value = null
    try {
      const s = await adminApi.saveSettings(clone(draft.value))
      saved.value = s
      draft.value = clone(s)
      status.value = `Сохранено в ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
    } catch (e) {
      error.value = handle(e)
    } finally {
      busy.value = false
    }
  }

  const reset = () => saved.value && (draft.value = clone(saved.value))
  return { saved, draft, dirty, error, status, busy, save, reset }
}

/** Пустое поле — null («без лимита»). */
export const toLimit = (v: string): number | null => (v.trim() === '' ? null : Math.floor(Number(v)))
