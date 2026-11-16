import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, type Challenge, type RegisterConsent, type Session, type Usage, type User } from '@/api'
import { setTokenProvider } from '@/api/http'
import { storage } from '@/lib/storage'

const TOKEN_KEY = 'ruai.token'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(storage.get<string | null>(TOKEN_KEY, null))
  const loading = ref(false)
  /** Профиль загружен хотя бы раз: до этого гость и «ещё не знаем» неразличимы. */
  const ready = ref(false)
  let pending: Promise<void> | null = null

  setTokenProvider(() => token.value)

  /** Подписка активна (не истекла). История чатов доступна и без неё. */
  const isPaid = computed(() => {
    const s = user.value?.subscription
    return !!s && Date.parse(s.expiresAt) > Date.now()
  })
  const usage = computed(() => (isPaid.value ? (user.value?.subscription?.usage ?? null) : null))
  /** Тариф активной подписки; без подписки: null. */
  const tier = computed(() => (isPaid.value ? (user.value?.subscription?.tier ?? 'text') : null))
  const canMedia = computed(() => tier.value === 'media')

  /** Сервер присылает свежие счётчики в событии `done`. */
  function setUsage(u: Usage) {
    if (user.value?.subscription) user.value.subscription.usage = u
  }
  const isGuest = computed(() => !user.value || user.value.isGuest)
  const displayName = computed(() => user.value?.login ?? user.value?.name ?? 'Гость')
  /** Аккаунт подтверждён Telegram: вход с 2FA, пароль восстанавливается. */
  const isProtected = computed(() => !!user.value?.telegram)
  /** Показывать плашку «Аккаунт не защищён»: вошёл, бот работает, Telegram не привязан. */
  const showUnprotected = computed(() => !isGuest.value && !!user.value?.tgEnabled && !user.value?.telegram)

  async function fetchMe() {
    loading.value = true
    try {
      user.value = await api.auth.me()
    } catch {
      user.value = null
    } finally {
      loading.value = false
      ready.value = true
    }
  }

  /** Дождаться первой загрузки профиля (повторно не запрашивает). */
  function ensure(): Promise<void> {
    if (ready.value) return Promise.resolve()
    return (pending ??= fetchMe().finally(() => (pending = null)))
  }

  function applySession(s: Session) {
    // настоящий сервер держит сессию в HttpOnly-cookie и токен не отдаёт; токен только у мока
    token.value = s.token || null
    if (s.token) storage.set(TOKEN_KEY, s.token)
    else storage.remove(TOKEN_KEY)
    user.value = s.user
    ready.value = true
  }

  async function register(login: string, password: string, consent: RegisterConsent) {
    applySession(await api.auth.register(login, password, consent))
  }

  /** done=false: пароль верный, ждём подтверждения в Telegram (заявка в ответе). */
  async function login(login: string, password: string): Promise<{ done: true } | ({ done: false } & Challenge)> {
    const r = await api.auth.login(login, password)
    if ('user' in r) {
      applySession(r)
      return { done: true }
    }
    return { done: false, ...r }
  }

  /** true: вход завершён. Ошибка 410 (заявка отклонена или устарела) пробрасывается. */
  async function finishChallenge(id: string, code?: string): Promise<boolean> {
    const r = await api.auth.challenge(id, code)
    if ('user' in r) {
      applySession(r)
      return true
    }
    return false
  }

  async function logout() {
    await api.auth.logout()
    token.value = null
    storage.remove(TOKEN_KEY)
    await fetchMe()
  }

  return {
    user,
    token,
    loading,
    ready,
    ensure,
    isGuest,
    isPaid,
    usage,
    tier,
    canMedia,
    displayName,
    isProtected,
    showUnprotected,
    fetchMe,
    register,
    login,
    finishChallenge,
    logout,
    setUsage,
  }
})
