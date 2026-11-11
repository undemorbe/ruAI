import { env } from '@/config/env'
import { mockAuth, mockBilling, mockChat } from './mocks'
import { httpAuth, httpBilling, httpChat } from './services/http'
import type { AuthService, BillingService, ChatService } from './services/contracts'

/** Single entry point for data access. UI never imports http/mocks directly. */
export const api: { auth: AuthService; chat: ChatService; billing: BillingService } = env.useMocks
  ? { auth: mockAuth, chat: mockChat, billing: mockBilling }
  : { auth: httpAuth, chat: httpChat, billing: httpBilling }

export * from './types'
export { ApiError } from './http'
