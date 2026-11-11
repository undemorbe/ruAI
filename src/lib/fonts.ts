const loaded = new Set<string>()

/** Lazily attaches a Google Fonts stylesheet (each variant loads only its own fonts). */
export function useGoogleFont(families: string) {
  if (typeof document === 'undefined' || loaded.has(families)) return
  loaded.add(families)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`
  document.head.appendChild(link)
}
