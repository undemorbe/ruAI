import type { AdminService } from './contract'
import { httpAdmin } from './http'
import { mockAdmin } from './mock'

/** Мок — только при явном VITE_ADMIN_MOCKS=true (npm run dev:admin). Прод-сборка ходит на сервер. */
export const adminApi: AdminService = import.meta.env.VITE_ADMIN_MOCKS === 'true' ? mockAdmin : httpAdmin
export { AdminError } from './http'
export * from './types'
