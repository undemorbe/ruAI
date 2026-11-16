/**
 * Быстрые вопросы на пустом экране чата. Каждый раз показываются случайные, кнопка
 * «Другие идеи» перетасовывает.
 * ask: отправляется сразу; fill: вставляется в поле, пользователь дописывает свой текст;
 * draw: отправляется в режиме «Создать изображение»; photo: вставляется в поле и открывает
 * выбор фото. draw и photo только там, где доступны изображения.
 */
export type SuggestionKind = 'ask' | 'fill' | 'draw' | 'photo'

export interface Suggestion {
  icon: string
  text: string
  kind: SuggestionKind
}

export const SUGGESTIONS: Suggestion[] = [
  { icon: 'pen', kind: 'ask', text: 'Напиши вежливое письмо о переносе встречи' },
  { icon: 'book', kind: 'ask', text: 'Составь план подготовки к ЕГЭ по физике' },
  { icon: 'route', kind: 'ask', text: 'Маршрут на 3 дня по Казани: еда, музеи, виды' },
  { icon: 'brain', kind: 'ask', text: 'Объясни квантовую запутанность, как ребёнку' },
  { icon: 'bolt', kind: 'ask', text: 'Придумай 10 названий для кофейни у моря' },
  { icon: 'pen', kind: 'ask', text: 'Тост на свадьбу друга: смешной и трогательный' },
  { icon: 'flask', kind: 'ask', text: 'Почему небо голубое, а закат красный?' },
  { icon: 'globe', kind: 'ask', text: 'ИП или самозанятость: сравни в таблице' },
  { icon: 'star', kind: 'ask', text: 'Придумай настольную игру на вечер для четверых' },
  { icon: 'user', kind: 'ask', text: 'Проведи со мной пробное собеседование' },
  { icon: 'sun', kind: 'ask', text: 'Меню на неделю для двоих на 5000 ₽' },
  { icon: 'route', kind: 'ask', text: 'Бюджет поездки в Петербург на выходные' },
  { icon: 'bubble', kind: 'ask', text: 'Ты Шерлок Холмс: найди мою пропавшую ручку' },
  { icon: 'code', kind: 'ask', text: 'Напиши на Python игру «Угадай число»' },
  { icon: 'brain', kind: 'ask', text: 'Задай 5 каверзных вопросов по истории России' },
  { icon: 'bolt', kind: 'ask', text: 'Как перестать откладывать дела: 5 приёмов' },
  { icon: 'pen', kind: 'ask', text: 'Стих про понедельник в стиле Маяковского' },
  { icon: 'flask', kind: 'ask', text: 'Что будет с Землёй, если исчезнет Луна?' },
  { icon: 'star', kind: 'ask', text: 'Придумай сказку на ночь про смелого ежа' },
  { icon: 'code', kind: 'fill', text: 'Объясни, что делает этот код:' },
  { icon: 'pen', kind: 'fill', text: 'Сделай этот текст короче и живее:' },
  { icon: 'globe', kind: 'fill', text: 'Переведи на английский, сохранив тон:' },
  { icon: 'spark', kind: 'draw', text: 'Нарисуй кота-космонавта акварелью' },
  { icon: 'spark', kind: 'draw', text: 'Нарисуй избушку в зимнем лесу, как в мультфильме' },
  { icon: 'spark', kind: 'draw', text: 'Нарисуй логотип пекарни «Тёплый хлеб»' },
  { icon: 'spark', kind: 'draw', text: 'Нарисуй осла-рыцаря в стиле старинной картины' },
  { icon: 'spark', kind: 'draw', text: 'Нарисуй открытку с енотом и тортом' },
  { icon: 'image', kind: 'photo', text: 'Что на этом фото? Разбери детали' },
  { icon: 'image', kind: 'photo', text: 'Реши задачу с фото по шагам' },
  { icon: 'image', kind: 'photo', text: 'Что приготовить из продуктов на фото?' },
]

/** Детерминированный генератор (mulberry32): одна раскладка на один seed. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(list: T[], rnd: () => number): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/**
 * Случайные подсказки без повторов. С изображениями: одна «нарисуй» и одна «с фото»,
 * остальные текстовые (из них не больше одной fill); без изображений только текстовые.
 */
export function pickSuggestions(opts: { media: boolean; count: number; seed: number }, pool: Suggestion[] = SUGGESTIONS): Suggestion[] {
  const rnd = seeded(opts.seed)
  const of = (k: SuggestionKind) => shuffled(
    pool.filter((s) => s.kind === k),
    rnd,
  )
  const special = opts.media ? [of('draw')[0], of('photo')[0]].filter((s): s is Suggestion => !!s) : []
  const fill = of('fill').slice(0, 1)
  const text = shuffled([...of('ask'), ...fill], rnd).slice(0, Math.max(0, opts.count - special.length))
  // картинки не первыми и не рядом: 2-я и 4-я позиции
  const out = [...text]
  special.forEach((s, i) => out.splice(Math.min(out.length, 1 + i * 2), 0, s))
  return out.slice(0, opts.count)
}
