/**
 * Черновик гостя на время регистрации: текст из поля ввода переживает переход
 * на /register и обратно. sessionStorage - только эта вкладка, после закрытия исчезает.
 */
const KEY = 'ruai.chat.draft'
export const MAX_DRAFT = 8000

export function saveDraft(text: string): void {
  const t = text.trim()
  try {
    if (t) sessionStorage.setItem(KEY, t.slice(0, MAX_DRAFT))
    else sessionStorage.removeItem(KEY)
  } catch {
    /* приватный режим или запрет хранилища: черновик останется только в поле */
  }
}

/** Забрать черновик один раз: после чтения он удаляется. */
export function takeDraft(): string | null {
  try {
    const t = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return t ? t.slice(0, MAX_DRAFT) : null
  } catch {
    return null
  }
}
