import { describe, expect, it } from 'vitest'
import { perDay, pluralRu, renderMarkdown } from '../format'

describe('format', () => {
  it('price per day', () => {
    expect(perDay(388, 7)).toBe(55)
    expect(perDay(100, 0)).toBe(100)
  })

  it('russian plurals', () => {
    const f: [string, string, string] = ['день', 'дня', 'дней']
    expect(pluralRu(1, f)).toBe('день')
    expect(pluralRu(3, f)).toBe('дня')
    expect(pluralRu(5, f)).toBe('дней')
    expect(pluralRu(11, f)).toBe('дней')
    expect(pluralRu(21, f)).toBe('день')
    expect(pluralRu(112, f)).toBe('дней')
  })

  it('renders fenced code with its language label', () => {
    const html = renderMarkdown('Вот так:\n\n```ts\nconst a = 1\n```\n\nГотово')
    expect(html).toContain('<span class="msg__lang">ts</span>')
    expect(html).toContain('<code class="hljs language-ts">')
    expect(html).toContain('<span class="hljs-keyword">const</span> a = <span class="hljs-number">1</span>')
    expect(html).toContain('<p>Готово</p>')
  })

  it('highlights known code languages and formats inline code distinctly', () => {
    const block = renderMarkdown('```js\nconst answer = 42;\n```')
    const inline = renderMarkdown('Запусти `npm test`')

    expect(block).toContain('<span class="hljs-keyword">const</span>')
    expect(inline).toContain('<code class="msg__inline-code">npm test</code>')
  })

  it('escapes code when the language is unknown', () => {
    const html = renderMarkdown('```unknown\n<img src=x>\n```')

    expect(html).toContain('<span class="msg__lang">unknown</span>')
    expect(html).toContain('&lt;img src=x&gt;')
    expect(html).not.toContain('<img')
  })

  it('escapes markup inside highlighted code', () => {
    const html = renderMarkdown('```js\nconst markup = "<img src=x>";\n```')

    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
  })

  it('keeps an unclosed fence while streaming', () => {
    const html = renderMarkdown('```py\nprint(1)')
    expect(html).toContain('<span class="msg__lang">py</span>')
    expect(html).toContain('<span class="hljs-built_in">print</span>')
    expect(html).toContain('<span class="hljs-number">1</span>')
  })

  it('renders headings, lists, tables, and inline formatting', () => {
    const html = renderMarkdown('# Заголовок\n\n- **важно**\n\n| A | B |\n| - | - |\n| 1 | 2 |')
    expect(html).toContain('<h1>Заголовок</h1>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<strong>важно</strong>')
    expect(html).toContain('<table>')
  })

  it('renders line breaks but escapes raw HTML and unsafe links', () => {
    const html = renderMarkdown('строка<br>следующая и `<br>`\n\n<img src=x onerror=alert(1)>\n\n[опасно](javascript:alert(1))')
    expect(html).toContain('строка<br>')
    expect(html).toContain('<code class="msg__inline-code">&lt;br&gt;</code>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('<img')
  })

  it('escapes raw HTML blocks', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
  })
})
