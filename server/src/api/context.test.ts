import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PRIOR_IMAGES, assembleMessages, pickContextImages, type CtxMessage } from './context.ts'
import type { Part } from './openrouter.ts'

const img = (url: string): Part => ({ type: 'image_url', image_url: { url } })

test('pickContextImages: все фото текущего сообщения и последние из контекста', () => {
  const images = [
    { id: 'a', messageId: 'm1', createdAt: 1 },
    { id: 'b', messageId: 'm2', createdAt: 2 },
    { id: 'c', messageId: 'm3', createdAt: 3 },
    { id: 'd', messageId: 'm3', createdAt: 4 },
    { id: 'x', messageId: 'gone', createdAt: 5 },
    { id: 'n1', messageId: 'cur', createdAt: 6 },
    { id: 'n2', messageId: 'cur', createdAt: 6 },
    { id: 'n3', messageId: 'cur', createdAt: 6 },
  ]
  const got = pickContextImages(images, ['m1', 'm2', 'm3', 'cur'], 'cur')
  assert.equal(PRIOR_IMAGES, 2)
  assert.deepEqual([...got], [
    ['m3', ['c', 'd']],
    ['cur', ['n1', 'n2', 'n3']],
  ], 'старые сверх лимита и вне контекста не идут')
  assert.deepEqual([...pickContextImages(images, ['m1', 'cur'], 'cur', 0)], [['cur', ['n1', 'n2', 'n3']]])
  assert.equal(pickContextImages([], ['m1'], 'cur').size, 0)
})

test('assembleMessages: фото пользователя в его сообщении, созданные картинки после ответа', () => {
  const ctx: CtxMessage[] = [
    { id: 'u1', role: 'user', content: '' },
    { id: 'a1', role: 'assistant', content: 'На фото кот.' },
    { id: 'u2', role: 'user', content: 'Нарисуй такого же в шляпе' },
    { id: 'a2', role: 'assistant', content: '' },
    { id: 'u3', role: 'user', content: 'Сделай шляпу красной' },
  ]
  const parts = new Map([
    ['u1', [img('data:image/jpeg;base64,AA')]],
    ['a2', [img('data:image/png;base64,BB')]],
  ])
  assert.deepEqual(assembleMessages(ctx, parts, 'Что на фото?'), [
    { role: 'user', content: [{ type: 'text', text: 'Фото' }, img('data:image/jpeg;base64,AA')] },
    { role: 'assistant', content: 'На фото кот.' },
    { role: 'user', content: 'Нарисуй такого же в шляпе' },
    { role: 'assistant', content: 'Изображение создано.' },
    { role: 'user', content: [{ type: 'text', text: 'Изображение, которое ты создал в ответе выше.' }, img('data:image/png;base64,BB')] },
    { role: 'user', content: 'Сделай шляпу красной' },
  ])
})

test('assembleMessages: только фото в последнем сообщении получает подсказку; пустые без картинок пропускаются', () => {
  const ctx: CtxMessage[] = [
    { id: 'a0', role: 'assistant', content: '' },
    { id: 'u1', role: 'user', content: '' },
  ]
  const p = img('data:image/webp;base64,CC')
  assert.deepEqual(assembleMessages(ctx, new Map([['u1', [p]]]), 'Что на фото?'), [{ role: 'user', content: [{ type: 'text', text: 'Что на фото?' }, p] }])
  assert.deepEqual(assembleMessages([{ id: 'a', role: 'assistant', content: 'Привет' }], new Map(), 'Что на фото?'), [
    { role: 'assistant', content: 'Привет' },
    { role: 'user', content: 'Что на фото?' },
  ])
  assert.deepEqual(assembleMessages([{ id: 'u', role: 'user', content: 'Текст' }], new Map(), 'x'), [{ role: 'user', content: 'Текст' }])
})
