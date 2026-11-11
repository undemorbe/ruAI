# ruAI

Нейросеть на русском без VPN — фронтенд: лендинг (7 вариантов стиля), чат и оплата.

**Стек:** Vite 8 · Vue 3.5 (`<script setup>`) · TypeScript · Pinia · Vue Router · three.js · Vitest · ESLint.

## Запуск

```bash
npm ci
cp .env.example .env
npm run dev
```

| Команда | Что делает |
| --- | --- |
| `npm run dev` | dev-сервер |
| `npm run build` | проверка типов и production-сборка в `dist/` |
| `npm run preview` | локальный просмотр сборки |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run typecheck` | `vue-tsc -b` |
| `npm test` | unit-тесты (Vitest + jsdom) |

## Страницы

| Путь | Страница |
| --- | --- |
| `/` | лендинг; вариант выбирается `?v=1…7` (запоминается) или переключателем внизу экрана |
| `/chat/:id?` | чат со стримингом ответа; `/chat?q=…` сразу отправляет вопрос |
| `/pricing` | тарифы: без изображений / с файлами и изображениями |
| `/checkout/:plan` | оформление: e-mail, способ оплаты (карта, СБП, SberPay), редирект к провайдеру |
| `/payment/result` | статус платежа (поллинг) |

### Варианты лендинга

1. **Сфера в предложении** — 3D-сфера (WebGL-шейдер) внутри заголовка «Спросите … по-русски»; по скроллу мягкое круглое окно раскрывается на весь экран.
2. **Две двери** — минимализм, тёмные тона, только факты.
3. **Живой чат** — продукт отвечает прямо на первом экране.
4. **Цветные главы** — каждая глава своего цвета, крупная типографика.
5. **Дроп** — чат, поданный как модная коллекция: табло, чек, одно слово-кнопка.
6. **Слова из частиц** — 3D: 14 000 частиц собираются в слова; можно собрать своё.
7. **ЙЦУКЕН** — 3D-клавиатура печатает вместе с посетителем и переводит английскую раскладку в русскую.

three.js загружается отдельным чанком только для вариантов 1, 6 и 7.

## Архитектура и backend

```
src/
  api/
    types.ts            доменные типы и события стрима
    http.ts             fetch-обёртка: таймаут, Bearer-токен, ApiError, чтение SSE
    services/contracts  интерфейсы AuthService / ChatService / BillingService
    services/http.ts    REST-реализация (для будущего backend)
    mocks/              реализация в браузере (localStorage), используется сейчас
    index.ts            выбор mock или http по env
  stores/               Pinia: user, chat, billing
  pages/ components/    UI приложения
  landings/             варианты лендинга + общие секции (shared/)
  content/              тексты, тарифы, FAQ
```

UI работает только через контракты из `api/services/contracts.ts`. Чтобы подключить backend, задайте `VITE_API_URL` и `VITE_USE_MOCKS=false`. Ожидаемые эндпоинты:

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/auth/me` | текущий пользователь и подписка |
| POST | `/auth/code`, `/auth/verify` | вход по коду из e-mail |
| GET | `/chats`, `/chats/:id/messages` | история |
| POST | `/chats/messages` | отправка; ответ — SSE-поток `ChatStreamEvent` (`chat` → `delta`… → `done` / `error`) |
| PATCH / DELETE | `/chats/:id` | переименование / удаление |
| GET | `/billing/plans?tier=text\|media` | тарифы |
| POST | `/billing/checkout` | создание платежа → `{ paymentId, confirmationUrl }` |
| GET | `/billing/payments/:id` | статус платежа |

Данные карт фронтенд не собирает: оплата проходит на странице платёжного провайдера.

## Переменные окружения

| Переменная | По умолчанию | Смысл |
| --- | --- | --- |
| `VITE_API_URL` | пусто | адрес API; пусто — работают моки |
| `VITE_USE_MOCKS` | `true` | принудительно включить моки |
| `VITE_BASE` | `/` | базовый путь; в CI для GitHub Pages — `/<repo>/` |

## CI/CD

- `.github/workflows/ci.yml` — на push в `main` и на pull request: lint, typecheck, тесты, сборка.
- `.github/workflows/deploy.yml` — на push в `main`: сборка и публикация на GitHub Pages (`404.html` — SPA-fallback).

## Браузеры и устройства

Сборка под ES2020 (Safari 14+, Chrome/Edge/Firefox 90+), autoprefixer по `.browserslistrc`. Адаптив от 320px, `svh/dvh` и safe-area для iOS, поля ввода 16px (без зума), `prefers-reduced-motion` учитывается во всех анимациях. Без WebGL 3D-варианты показывают статичную замену.

## Перед запуском в прод

- Отзывы в `src/content/landing.ts` — **выдуманные заглушки** для вёрстки. Замените их на реальные (с согласия авторов).
- Проверьте тексты оферты, политики конфиденциальности и e-mail поддержки (`src/config/app.ts`).

## Лицензия

Учебное и некоммерческое использование — с указанием автора (Boris Stankov). Коммерческое использование запрещено. Подробнее в [LICENSE](LICENSE).
