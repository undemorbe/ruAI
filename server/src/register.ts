/**
 * Подключается через `node --import ./src/register.ts`: учит Node разрешать импорты фронтенда
 * `@/…` (→ ../src/…) и импорты без расширения внутри ../src. Так сервер использует те же
 * правила тарифов и лимитов (src/content/plans.ts, src/lib/limits.ts), что и интерфейс.
 */
import { register } from 'node:module'

register('./alias.ts', import.meta.url)
