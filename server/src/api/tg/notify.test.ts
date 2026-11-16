import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TgApi, TgButton } from './api.ts'
import { describeDevice } from './device.ts'
import { tgNotifier } from './notify.ts'

test('устройство: браузер и ОС из UA, мусор не попадает в текст', () => {
  assert.equal(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'), 'Chrome, macOS')
  assert.equal(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'), 'Safari, iOS')
  assert.equal(describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0'), 'Edge, Windows')
  assert.equal(describeDevice('<script>alert(1)</script>'), 'неизвестное устройство')
})

function fakeApi(fail = false) {
  const sent: { chat: number; text: string; buttons?: TgButton[][] }[] = []
  const api = {
    sendMessage: async (chat: number, text: string, buttons?: TgButton[][]) => {
      if (fail) throw new Error('403')
      sent.push({ chat, text, buttons })
      return { message_id: 5 }
    },
  } as unknown as TgApi
  return { api, sent }
}

test('заявка на вход: время МСК, код, две кнопки с ref', async () => {
  const { api, sent } = fakeApi()
  const n = tgNotifier(api, 'ruchatgpt_auth_bot', 'https://ru-chatgpt.com')
  const id = await n.loginPrompt(42, { ref: 'r'.repeat(22), code: '482913', device: 'Chrome, macOS', at: Date.parse('2026-11-16T09:04:00Z') })
  assert.equal(id, 5)
  assert.match(sent[0]!.text, /^Вход в ru-chatgpt\.com/)
  assert.match(sent[0]!.text, /Chrome, macOS · 16\.11, 12:04 МСК/)
  assert.match(sent[0]!.text, /Код: 482 913/)
  assert.deepEqual(sent[0]!.buttons, [
    [
      { text: '✅ Подтвердить', callback_data: `ok:${'r'.repeat(22)}` },
      { text: '⛔ Это не я', callback_data: `no:${'r'.repeat(22)}` },
    ],
  ])
  assert.equal(n.linkUrl('tok'), 'https://t.me/ruchatgpt_auth_bot?start=tok')
})

test('сбой отправки: null / false, исключение наружу не летит', async () => {
  const n = tgNotifier(fakeApi(true).api, 'b', 'https://ru-chatgpt.com')
  assert.equal(await n.loginPrompt(1, { ref: 'x', code: '000000', device: 'd', at: 0 }), null)
  assert.equal(await n.resetLink(1, 'https://ru-chatgpt.com/reset#x'), false)
})
