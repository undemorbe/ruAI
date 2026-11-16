/**
 * Общие данные сайта для поисковиков. Только публичное: никаких служебных путей,
 * ключей и реквизитов владельца (ИНН, ИП и ФИО на сайте пока не публикуются).
 */
export const SITE_URL = 'https://ru-chatgpt.com'
export const SITE_HOST = 'ru-chatgpt.com'
/** Название сайта для og:site_name и WebSite в JSON-LD. */
export const SITE_NAME = 'ChatGPT на русском'
/** Короткое имя для title и манифеста. */
export const SHORT_NAME = 'ChatGPT'
export const THEME_COLOR = '#0a0a0a'
export const LOCALE = 'ru_RU'
export const LANG = 'ru'

/** Картинка для соцсетей и мессенджеров, 1200×630 (генерирует scripts/seo-assets.mjs). */
export const OG_IMAGE = { path: '/og.png', width: 1200, height: 630, alt: 'ChatGPT на русском без VPN, оплата российской картой' }
/** Логотип для Organization: квадрат 512×512. */
export const LOGO_PATH = '/icon-512.png'

export const DISCLAIMER = 'Независимый сервис, не связан с OpenAI. ChatGPT - товарный знак OpenAI.'

/**
 * Коды подтверждения прав в Яндекс.Вебмастере и Google Search Console.
 * Вписать значение атрибута content из выданного мета-тега (это не секрет: тег публичный).
 * Пустая строка - тег не выводится.
 */
export const VERIFICATION = {
  yandex: '5af21e86797a621f',
  google: 'qYPY01UZvOvza_oYuZ5rkjmfK6fMaF5oGqkqYZAqVr0',
}

/**
 * Ключ IndexNow (Яндекс): файл public/<ключ>.txt с этим же текстом подтверждает право на сайт,
 * deploy/indexnow.sh после выкладки сообщает Яндексу адреса из sitemap. Ключ публичный, не секрет.
 */
export const INDEXNOW_KEY = '1edb61ce52f6509926a0081a67f74d0f'

export const absUrl = (path: string) => SITE_URL + (path === '/' ? '/' : path)
