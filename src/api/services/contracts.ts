import type {
  Challenge,
  ChallengeResult,
  ChatStreamEvent,
  ChatSummary,
  CheckoutRequest,
  CheckoutSession,
  ID,
  ImageRef,
  ISODate,
  LoginResult,
  Message,
  PaymentInfo,
  Plan,
  PlanTier,
  RegisterConsent,
  SendMessagePayload,
  Session,
  User,
} from '../types'

/** Each service has an HTTP implementation and a mock one with the same contract. */

export interface AuthService {
  me(): Promise<User>
  register(login: string, password: string, consent: RegisterConsent): Promise<Session>
  /** Неверный пароль и несуществующий логин дают одинаковую ошибку bad_credentials. */
  login(login: string, password: string): Promise<LoginResult>
  /** Опрос заявки 2FA или ввод кода. 410: заявка отклонена (challenge_denied) или устарела. */
  challenge(id: string, code?: string): Promise<ChallengeResult>
  changePassword(current: string, password: string): Promise<void>
  /** Ответ одинаков для любого логина: ссылка приходит в Telegram, если он привязан. */
  requestReset(login: string): Promise<void>
  confirmReset(token: string, password: string): Promise<void>
  /** Ссылка на бота для привязки; привязка завершается в боте, сайт узнаёт о ней по me(). */
  linkTelegram(): Promise<{ url: string; expiresAt: ISODate }>
  /** Отвязка подтверждается в боте; после неё все сессии закрываются. */
  unlinkTelegram(): Promise<Challenge>
  logout(): Promise<void>
}

export interface ChatService {
  list(): Promise<ChatSummary[]>
  messages(chatId: ID): Promise<Message[]>
  /** Загрузка фото (тариф с изображениями). */
  upload(file: File): Promise<ImageRef>
  send(payload: SendMessagePayload, signal?: AbortSignal): AsyncIterable<ChatStreamEvent>
  rename(chatId: ID, title: string): Promise<void>
  remove(chatId: ID): Promise<void>
}

export interface BillingService {
  plans(tier: PlanTier): Promise<Plan[]>
  checkout(req: CheckoutRequest): Promise<CheckoutSession>
  payment(paymentId: ID): Promise<PaymentInfo>
}
