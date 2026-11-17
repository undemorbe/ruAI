import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stripImageUrls, systemPrompt } from './prompts.ts'

test('systemPrompt: текстовый тариф без картинок, расширенный с инструментом или с отказом', () => {
  for (const a of ['none', 'on', 'off'] as const) {
    assert.match(systemPrompt(a), /отвечай на русском языке/i)
    assert.match(systemPrompt(a), /Markdown/)
    assert.match(systemPrompt(a), /HTML/)
    assert.match(systemPrompt(a), /Не раскрывай внутренние рассуждения/i)
    assert.match(systemPrompt(a), /Привет! Чем могу помочь сегодня\?/)
    assert.match(systemPrompt(a), /Пиши кратко и ясно/)
  }
  assert.match(systemPrompt('none'), /тарифе с фото и изображениями/)
  assert.doesNotMatch(systemPrompt('none'), /инструмент/)
  assert.match(systemPrompt('on'), /вызови инструмент один раз/)
  assert.match(systemPrompt('off'), /недоступно/)
  for (const a of ['none', 'on', 'off'] as const) assert.ok(!systemPrompt(a).includes('—'), 'без длинного тире')
})

test('stripImageUrls: вырезает Markdown-картинки и data:URL, остальной текст не трогает', () => {
  assert.equal(stripImageUrls('Готово!\n\n![осёл](data:image/png;base64,iVBOR==)\n\n\n\nНравится?'), 'Готово!\n\nНравится?')
  assert.equal(stripImageUrls('см. ![x](https://a.example/x.png) тут'), 'см.  тут')
  assert.equal(stripImageUrls('raw data:image/jpeg;base64,/9j/4AAQ== end'), 'raw  end')
  assert.equal(stripImageUrls('[ссылка](https://example.com) и `код`'), '[ссылка](https://example.com) и `код`')
})
