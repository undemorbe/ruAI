import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, _from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 72 }
    return { top: 0 }
  },
  routes: [
    { path: '/', name: 'landing', component: () => import('@/pages/LandingPage.vue'), meta: { title: 'ruAI — нейросеть без VPN' } },
    { path: '/chat/:id?', name: 'chat', component: () => import('@/pages/ChatPage.vue'), meta: { title: 'Чат — ruAI' } },
    { path: '/pricing', name: 'pricing', component: () => import('@/pages/PricingPage.vue'), meta: { title: 'Тарифы — ruAI' } },
    { path: '/checkout/:plan', name: 'checkout', component: () => import('@/pages/CheckoutPage.vue'), meta: { title: 'Оплата — ruAI' } },
    { path: '/payment/result', name: 'payment-result', component: () => import('@/pages/PaymentResultPage.vue'), meta: { title: 'Статус оплаты — ruAI' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/pages/NotFoundPage.vue'), meta: { title: 'Страница не найдена — ruAI' } },
  ],
})

router.afterEach((to) => {
  if (typeof to.meta.title === 'string') document.title = to.meta.title
})
