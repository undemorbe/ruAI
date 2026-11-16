/** Подключение администратора по одноразовой ссылке `#/invite/<token>`. */
export const MIN_ADMIN_PASSWORD = 14

/** Токен из адреса; null - это не ссылка-приглашение. */
export function inviteToken(hash: string): string | null {
  const m = /^#\/invite\/([A-Za-z0-9_-]{20,100})$/.exec(hash)
  return m ? m[1]! : null
}

/** Секрет группами по 4 - так его проще перепечатать в приложение. */
export const groupSecret = (s: string) => s.replace(/(.{4})(?=.)/g, '$1 ')

/** Проверка пароля до отправки (сервер проверяет то же). */
export function checkInvitePassword(password: string, again: string): string | null {
  if (password.length < MIN_ADMIN_PASSWORD) return `Пароль - не короче ${MIN_ADMIN_PASSWORD} символов`
  if (password !== again) return 'Пароли не совпадают'
  return null
}
