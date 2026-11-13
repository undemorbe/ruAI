import { defineAsyncComponent, type Component } from 'vue'

export interface LandingVariant {
  id: number
  name: string
  description: string
  swatch: [string, string]
  component: Component
}

/**
 * Earlier landing directions, kept for later use. Not linked anywhere:
 * preview one with /?v=<id> (the switcher appears only in that mode).
 * Each is a separate lazy chunk.
 */
export const VARIANTS: LandingVariant[] = [
  { id: 1, name: 'Сфера в предложении', description: '3D-сфера внутри заголовка, лазурь и тёмно-синий', swatch: ['#071733', '#38b6ff'], component: defineAsyncComponent(() => import('./v1-nebula/NebulaLanding.vue')) },
  { id: 2, name: 'Две двери', description: 'Минимализм, тёмные тона, только факты', swatch: ['#141512', '#9db477'], component: defineAsyncComponent(() => import('./v2-noir/NoirLanding.vue')) },
  { id: 3, name: 'Живой чат', description: 'Продукт отвечает прямо на первом экране', swatch: ['#f1efea', '#a08672'], component: defineAsyncComponent(() => import('./v3-gazette/GazetteLanding.vue')) },
  { id: 4, name: 'Цветные главы', description: 'Каждая глава — свой цвет, крупный шрифт', swatch: ['#1423b8', '#f7dd47'], component: defineAsyncComponent(() => import('./v4-pop/PopLanding.vue')) },
  { id: 5, name: 'Дроп', description: 'Чат как модная коллекция: табло, чек, одно слово', swatch: ['#191919', '#d71e1e'], component: defineAsyncComponent(() => import('./v5-avant/AvantLanding.vue')) },
  { id: 7, name: 'ЙЦУКЕН', description: '3D-клавиатура печатает вместе с вами', swatch: ['#ddd5c4', '#e8642c'], component: defineAsyncComponent(() => import('./v7-keys/KeysLanding.vue')) },
]

