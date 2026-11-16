import { createApp } from 'vue'

import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { isStalePrerender } from './seo/path'
import './styles/base.css'

// Статический текст для роботов из чужого пререндера (nginx отдал index.html главной на /chat/123) не показываем.
const pre = document.querySelector('[data-prerendered]')
if (pre && isStalePrerender(pre.getAttribute('data-prerendered'), location.pathname)) pre.remove()

const app = createApp(App).use(createPinia()).use(router)
// монтируем, когда страница маршрута загружена: статический текст сменяется сразу готовой страницей
void router.isReady().then(() => app.mount('#app'))
