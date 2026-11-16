import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VisibleTextStream } from './visibleText.ts'

test('hides reasoning blocks when tags are split across chunks and emits visible text word by word', () => {
  const stream = new VisibleTextStream()
  const out = [
    ...stream.push('<thi'),
    ...stream.push('nk>This is private reasoning.'),
    ...stream.push('</thi'),
    ...stream.push('nk>Привет, мир!'),
    ...stream.flush(),
  ]

  assert.deepEqual(out, ['Привет, ', 'мир!'])
  assert.doesNotMatch(out.join(''), /private reasoning|think/i)
})

test('drops an unfinished reasoning block at end of stream', () => {
  const stream = new VisibleTextStream()
  const out = [...stream.push('Ответ доступен. <analysis>private'), ...stream.flush()]

  assert.equal(out.join(''), 'Ответ доступен. ')
  assert.doesNotMatch(out.join(''), /private|analysis/i)
})

test('removes orphaned reasoning closing markers without exposing marker text', () => {
  const stream = new VisibleTextStream()
  const out = [...stream.push('Ответ</think> дальше'), ...stream.flush()]

  assert.equal(out.join(''), 'Ответ дальше')
})
