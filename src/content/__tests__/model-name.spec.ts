import { describe, expect, it } from 'vitest'
import { MODEL_NAME } from '@/config/app'
import { askExamples, faq, reviews } from '../landing'
import { landingSeo } from '../landing-seo'
import { getPlans } from '../plans'
import wordsLanding from '../../landings/words/WordsLanding.vue?raw'

describe('model name: ChatGPT-6.1 Astra in the app, plain ChatGPT on the main page', () => {
  const mainTexts = [
    wordsLanding,
    JSON.stringify(landingSeo),
    JSON.stringify(askExamples),
    JSON.stringify(faq),
    JSON.stringify(reviews),
    // главная показывает только текстовые тарифы
    JSON.stringify(getPlans('text').map((p) => [p.title, p.tagline, p.features])),
  ]

  it('main page says ChatGPT and never the model name', () => {
    expect(wordsLanding).toContain('ChatGPT')
    for (const t of mainTexts) {
      expect(t).not.toContain(MODEL_NAME)
      expect(t).not.toMatch(/Astra|6\.1/)
      // внутренние модели (GPT-OSS, GPT-5.6 Luna, GPT Image Flare) пользователю не называем
      expect(t).not.toMatch(/Luna|GPT-5|OSS|Flare/)
    }
  })
})
