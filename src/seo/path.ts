/** Работа с путями без зависимостей: импортируется в main.ts и не тянет тексты страниц в основной чанк. */

/** Путь без завершающего слэша, query и hash; пустой - главная. */
export function normalizePath(path: string): string {
  const p = (path.split(/[?#]/)[0] ?? '/').replace(/\/+$/, '')
  return p === '' ? '/' : p
}

/** Пререндер не для этого адреса (например, /chat/123 получил index.html главной) - убрать до монтирования. */
export function isStalePrerender(prerenderedPath: string | null, pathname: string): boolean {
  return prerenderedPath !== null && normalizePath(prerenderedPath) !== normalizePath(pathname)
}

/** Метки рекламы и аналитики, которые не меняют содержимое страницы (Clean-param Яндекса, адреса для Метрики). */
export const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid', 'fbclid', 'ysclid', '_openstat', 'from', 'v']
