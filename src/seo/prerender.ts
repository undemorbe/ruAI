import { renderHead } from './head'
import { PRERENDERED, fileFor, seoForPath, type SeoPage } from './pages'
import { STATIC_CSS, renderBody } from './static'

/**
 * Пререндер: в собранный index.html (шаблон с метками) подставляются мета страницы и
 * статический текст. Вызывается из vite.config.ts: в dev - на каждый запрос, при сборке -
 * для всех страниц из PRERENDERED.
 */

export const HEAD_MARK = '<!--seo-head-->'
export const BODY_MARK = '<!--seo-body-->'

export function renderPage(shell: string, page: SeoPage): string {
  if (!shell.includes(HEAD_MARK) || !shell.includes(BODY_MARK)) throw new Error('index.html: нет меток <!--seo-head--> / <!--seo-body-->')
  const body = renderBody(page)
  const head = renderHead(page) + (body ? `\n    <style>${STATIC_CSS}</style>` : '')
  // функция-заменитель: «$» в тексте страницы не трактуется как шаблон замены
  return shell.replace(HEAD_MARK, () => head).replace(BODY_MARK, () => body)
}

export const renderPath = (shell: string, path: string) => renderPage(shell, seoForPath(path))

/** Все файлы пререндера: путь относительно dist и HTML. */
export function prerenderAll(shell: string): { file: string; html: string }[] {
  return PRERENDERED.map((page) => ({ file: fileFor(page.path), html: renderPage(shell, page) }))
}
