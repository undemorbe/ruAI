import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, _from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 72 }
    return { top: 0 }
  },
  routes: [
    { path: '/', name: 'landing', component: () => import('@/pages/LandingPage.vue') },
    { path: '/chat/:id?', name: 'chat', component: () => import('@/pages/ChatPage.vue') },
    { path: '/pricing', name: 'pricing', component: () => import('@/pages/PricingPage.vue') },
    { path: '/payment', name: 'payment', component: () => import('@/pages/PaymentInfoPage.vue') },
    { path: '/faq', name: 'faq', component: () => import('@/pages/FaqPage.vue') },
    { path: '/checkout/:plan', name: 'checkout', component: () => import('@/pages/CheckoutPage.vue') },
    { path: '/login', name: 'login', component: () => import('@/pages/AuthPage.vue'), meta: { mode: 'login' } },
    { path: '/register', name: 'register', component: () => import('@/pages/AuthPage.vue'), meta: { mode: 'register' } },
    { path: '/legal/:doc?', name: 'legal', component: () => import('@/pages/LegalPage.vue') },
    { path: '/account', name: 'account', component: () => import('@/pages/AccountPage.vue') },
    { path: '/reset', name: 'reset', component: () => import('@/pages/ResetPage.vue') },
    { path: '/payment/result', name: 'payment-result', component: () => import('@/pages/PaymentResultPage.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/pages/NotFoundPage.vue') },
  ],
})

// title, description, canonical, robots, OG и JSON-LD - из реестра src/seo/pages.ts
// модуль грузится отдельным чанком: тексты страниц не попадают в основной бандл
router.afterEach(async (to) => {
  const [{ applyHead }, { seoForPath }] = await Promise.all([import('@/seo/head'), import('@/seo/pages')])
  if (router.currentRoute.value.path === to.path) applyHead(document, seoForPath(to.path))
})
