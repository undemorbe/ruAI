/**
 * Токен сброса пароля из фрагмента ссылки (/reset#<токен>). Сразу стирается из адреса и истории,
 * чтобы не остаться в закладках, истории браузера и при пересылке ссылки на страницу.
 */
const TOKEN = /^[\w-]{43}$/

export function readResetToken(loc: Pick<Location, 'hash' | 'pathname' | 'search'>, history: Pick<History, 'replaceState'>): string | null {
  const raw = loc.hash.replace(/^#/, '')
  if (raw) history.replaceState(null, '', loc.pathname + loc.search)
  // мок отдаёт ссылки вида #mock-<логин>
  return TOKEN.test(raw) || /^mock-[a-z0-9._-]{3,32}$/.test(raw) ? raw : null
}
