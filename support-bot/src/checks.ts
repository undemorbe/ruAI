/**
 * Проверка супергруппы поддержки при старте: это форум, бот в ней админ с правом «Управление темами».
 * Возвращает список проблем — их пишем в журнал, чтобы настройку было легко поправить.
 */
import { type TelegramApi, errText } from './telegram.ts'

interface ChatInfo {
  type: string
  is_forum?: boolean
}

interface MemberInfo {
  status: string
  can_manage_topics?: boolean
  can_delete_messages?: boolean
}

export async function checkSupportChat(api: TelegramApi, chatId: number, botId: number): Promise<string[]> {
  const problems: string[] = []
  try {
    const chat = await api.call<ChatInfo>('getChat', { chat_id: chatId })
    if (chat.type !== 'supergroup') problems.push('SUPPORT_CHAT_ID — не супергруппа')
    else if (!chat.is_forum) problems.push('в супергруппе не включены темы (Настройки группы → Темы)')
  } catch (e) {
    return [`бот не видит супергруппу SUPPORT_CHAT_ID (${errText(e)}) — добавьте его в группу`]
  }
  try {
    const me = await api.call<MemberInfo>('getChatMember', { chat_id: chatId, user_id: botId })
    if (me.status !== 'administrator') problems.push('бот не администратор супергруппы')
    else if (!me.can_manage_topics) problems.push('у бота нет права администратора «Управление темами»')
  } catch (e) {
    problems.push(`не удалось проверить права бота (${errText(e)})`)
  }
  return problems
}

/** Подсказки команд в меню Telegram: пользователю — только /start, в группе поддержки — команды сотрудников. */
export async function registerCommands(api: TelegramApi, chatId: number): Promise<void> {
  await api.call('setMyCommands', {
    scope: { type: 'all_private_chats' },
    commands: [{ command: 'start', description: 'Как написать в поддержку' }],
  })
  await api.call('setMyCommands', {
    scope: { type: 'chat', chat_id: chatId },
    commands: [
      { command: 'close', description: 'Закрыть обращение' },
      { command: 'ban', description: 'Заблокировать пользователя' },
      { command: 'unban', description: 'Снять блокировку' },
      { command: 'info', description: 'Карточка пользователя с кнопками' },
      { command: 't', description: 'Шаблоны ответов' },
      { command: 'help', description: 'Справка' },
    ],
  })
}
