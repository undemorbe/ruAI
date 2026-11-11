import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, type User } from '@/api'
import { setTokenProvider } from '@/api/http'
import { storage } from '@/lib/storage'

const TOKEN_KEY = 'ruai.token'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(storage.get<string | null>(TOKEN_KEY, null))
  const loading = ref(false)

  setTokenProvider(() => token.value)

  const isPaid = computed(() => !!user.value?.subscription)
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

  return { user, token, loading, isPaid, displayName, fetchMe, login, logout }
})
