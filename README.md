# ruAI

Нейросеть на русском без VPN — фронтенд: лендинг, чат и оплата.

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
| `/` | лендинг «Слова из частиц»; `/?v=<id>` — просмотр архивного варианта |
| `/chat/:id?` | чат со стримингом ответа; `/chat?q=…` сразу отправляет вопрос |
| `/pricing` | тарифы: без изображений / с файлами и изображениями |
| `/checkout/:plan` | оформление: e-mail, способ оплаты (карта, СБП, SberPay), редирект к провайдеру |
| `/payment/result` | статус платежа (поллинг) |

### Лендинг

Основной лендинг — **«Слова из частиц»** (`src/landings/words/`), чёрно-белый: 14 000 частиц (three.js) собираются в слова, которые пишет ruAI; курсор раздвигает частицы, а посетитель может собрать своё слово и сразу спросить про него в чате. three.js грузится отдельным чанком.

### Архив вариантов

Прежние направления лежат в `src/landings/legacy/` и в навигации не участвуют. Посмотреть любое можно по `/?v=<id>`, внизу появится переключатель архива:

1. Сфера в предложении — 3D-сфера внутри заголовка, окно раскрывается по скроллу.
2. Две двери — минимализм, тёмные тона, только факты.
3. Живой чат — продукт отвечает прямо на первом экране.
4. Цветные главы — каждая глава своего цвета.
5. Дроп — чат, поданный как модная коллекция.
7. ЙЦУКЕН — 3D-клавиатура печатает вместе с посетителем.

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
  landings/
    words/              основной лендинг
    shared/             общие секции (тарифы, FAQ, CTA, футер, фрагмент чата)
    legacy/             архив вариантов + реестр и переключатель для ?v=
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
