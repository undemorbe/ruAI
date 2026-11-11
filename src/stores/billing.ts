import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { api, type Plan, type PlanTier } from '@/api'
import { storage } from '@/lib/storage'

export const useBillingStore = defineStore('billing', () => {
  const tier = ref<PlanTier>(storage.get<PlanTier>('ruai.tier', 'text'))
  const plans = ref<Plan[]>([])
  const loading = ref(false)

  async function loadPlans() {
    loading.value = true
    try {
      plans.value = await api.billing.plans(tier.value)
    } finally {
      loading.value = false
    }
  }

  watch(tier, (t) => {
    storage.set('ruai.tier', t)
    void loadPlans()
  })

  return { tier, plans, loading, loadPlans }
})
