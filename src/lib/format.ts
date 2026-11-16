import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'

const rub = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

export const formatPrice = (n: number) => rub.format(n)

/** Price per day, rounded to whole rubles. */
export const perDay = (price: number, days: number) => Math.round(price / Math.max(days, 1))

export function pluralRu(n: number, forms: [string, string, string]): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return forms[0]
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1]
  return forms[2]
}

// Parse HTML tokens to preserve <br>, but escape every other raw tag before rendering.
const markdown = new MarkdownIt({ html: true, breaks: true })

markdown.renderer.rules.html_inline = (tokens, index) => {
  const token = tokens[index]!
  if (/^<br\s*\/?>$/i.test(token.content)) return '<br>\n'
  return markdown.utils.escapeHtml(token.content)
}

markdown.renderer.rules.html_block = (tokens, index) => {
  const content = tokens[index]!.content
  if (/^(?:\s*<br\s*\/?>\s*)+$/i.test(content)) return content.replace(/<br\s*\/?>/gi, '<br>\n')
  return markdown.utils.escapeHtml(content)
}

markdown.renderer.rules.fence = (tokens, index) => {
  const token = tokens[index]!
  const lang = token.info.trim().split(/\s+/, 1)[0] ?? ''
  const label = lang ? `<span class="msg__lang">${markdown.utils.escapeHtml(lang)}</span>` : ''
  const languageClass = lang ? ` language-${markdown.utils.escapeHtml(lang)}` : ''
  const highlighted = lang && hljs.getLanguage(lang)
    ? hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value
    : markdown.utils.escapeHtml(token.content)
  return `<pre class="msg__code">${label}<code class="hljs${languageClass}">${highlighted}</code></pre>\n`
}

markdown.renderer.rules.code_inline = (tokens, index) => {
  const content = markdown.utils.escapeHtml(tokens[index]!.content)
  return `<code class="msg__inline-code">${content}</code>`
}

/** Render model output as Markdown while escaping raw HTML and unsafe link protocols. */
export function renderMarkdown(src: string): string {
  return markdown.render(src)
}
