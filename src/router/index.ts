import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, _from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 72 }
    return { top: 0 }
  },
  routes: [
    { path: '/', name: 'landing', component: () => import('@/pages/LandingPage.vue'), meta: { title: 'ChatGPT — нейросеть без VPN' } },
    { path: '/chat/:id?', name: 'chat', component: () => import('@/pages/ChatPage.vue'), meta: { title: 'Чат — ChatGPT' } },
    { path: '/pricing', name: 'pricing', component: () => import('@/pages/PricingPage.vue'), meta: { title: 'Тарифы — ChatGPT' } },
    { path: '/checkout/:plan', name: 'checkout', component: () => import('@/pages/CheckoutPage.vue'), meta: { title: 'Оплата — ChatGPT' } },
    { path: '/payment/result', name: 'payment-result', component: () => import('@/pages/PaymentResultPage.vue'), meta: { title: 'Статус оплаты — ChatGPT' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/pages/NotFoundPage.vue'), meta: { title: 'Страница не найдена — ChatGPT' } },
  ],
})

router.afterEach((to) => {
  if (typeof to.meta.title === 'string') document.title = to.meta.title
})
