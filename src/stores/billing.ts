import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, type Plan } from '@/api'

export const useBillingStore = defineStore('billing', () => {
  const plans = ref<Plan[]>([])
  const loading = ref(false)

  async function loadPlans() {
    loading.value = true
    try {
      plans.value = await api.billing.plans()
    } finally {
      loading.value = false
    }
  }

  return { plans, loading, loadPlans }
})
