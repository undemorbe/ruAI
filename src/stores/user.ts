import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, type Usage, type User } from '@/api'
import { setTokenProvider } from '@/api/http'
import { storage } from '@/lib/storage'

const TOKEN_KEY = 'ruai.token'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(storage.get<string | null>(TOKEN_KEY, null))
  const loading = ref(false)

  setTokenProvider(() => token.value)

  /** Подписка активна (не истекла). История чатов доступна и без неё. */
  const isPaid = computed(() => {
    const s = user.value?.subscription
    return !!s && Date.parse(s.expiresAt) > Date.now()
  })
  const usage = computed(() => (isPaid.value ? (user.value?.subscription?.usage ?? null) : null))
  /** Тариф активной подписки; без подписки — null. */
  const tier = computed(() => (isPaid.value ? (user.value?.subscription?.tier ?? 'text') : null))
  const canMedia = computed(() => tier.value === 'media')

  /** Сервер присылает свежие счётчики в событии `done`. */
  function setUsage(u: Usage) {
    if (user.value?.subscription) user.value.subscription.usage = u
  }
  const displayName = computed(() => user.value?.email ?? user.value?.name ?? 'Гость')

  async function fetchMe() {
    loading.value = true
    try {
      user.value = await api.auth.me()
    } catch {
      user.value = null
    } finally {
      loading.value = false
    }
  }

  async function login(email: string, code: string) {
    const res = await api.auth.verifyCode(email, code)
    token.value = res.token
    storage.set(TOKEN_KEY, res.token)
    user.value = res.user
  }

  async function logout() {
    await api.auth.logout()
    token.value = null
    storage.remove(TOKEN_KEY)
    await fetchMe()
  }

  return { user, token, loading, isPaid, usage, tier, canMedia, displayName, fetchMe, login, logout, setUsage }
})
