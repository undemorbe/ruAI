import type { Plan, PlanTier } from '@/api/types'

const base = {
  week: {
    title: '1 неделя',
    periodDays: 7,
    tagline: 'Расширенный доступ к интеллекту для повседневных задач',
    features: [
      { icon: 'spark', text: 'Простые и понятные объяснения' },
      { icon: 'bubble', text: 'Короткие диалоги по общим вопросам' },
      { icon: 'brain', text: 'Базовая память и контекст' },
    ],
  },
  month: {
    title: '1 месяц',
    periodDays: 30,
    tagline: 'Делайте больше с помощью передовой модели',
    features: [
      { icon: 'spark', text: 'Решение сложных задач и кода' },
      { icon: 'bubble', text: 'Длинные диалоги в нескольких сессиях' },
      { icon: 'brain', text: 'Память о целях и прошлых разговорах' },
      { icon: 'route', text: 'Планы поездок и задачи в режиме агента' },
    ],
  },
  quarter: {
    title: '3 месяца',
    periodDays: 90,
    tagline: 'Доступ к лучшим функциям и возможностям ChatGPT',
    features: [
      { icon: 'spark', text: 'Продвинутые исследования и темы' },
      { icon: 'bubble', text: 'Большие проекты и сложные проблемы' },
      { icon: 'brain', text: 'Полный контекст и максимум памяти' },
      { icon: 'route', text: 'Исследования и задачи планирования' },
      { icon: 'flask', text: 'Ранний доступ к новым функциям' },
    ],
  },
} as const

const prices: Record<PlanTier, Record<keyof typeof base, [number, number]>> = {
  text: { week: [388, 688], month: [988, 1288], quarter: [1880, 2880] },
  media: { week: [588, 988], month: [1388, 1888], quarter: [2780, 3880] },
}

export function getPlans(tier: PlanTier): Plan[] {
  return (Object.keys(base) as (keyof typeof base)[]).map((id) => {
    const [price, oldPrice] = prices[tier][id]
    const extra =
      tier === 'media'
        ? [{ icon: 'image', text: 'Работа с файлами, фото и генерация изображений' }]
        : []
    return {
      id,
      tier,
      title: base[id].title,
      periodDays: base[id].periodDays,
      tagline: base[id].tagline,
      features: [...base[id].features, ...extra],
      price,
      oldPrice,
      currency: 'RUB',
      popular: id === 'month',
    }
  })
}
