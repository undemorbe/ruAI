/** Короткое описание устройства для сообщения о входе: «Chrome, macOS». Только из белого списка. */
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/YaBrowser\//, 'Яндекс Браузер'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
]

export function describeDevice(ua: string): string {
  const b = BROWSERS.find(([re]) => re.test(ua))?.[1]
  const s = SYSTEMS.find(([re]) => re.test(ua))?.[1]
  if (!b && !s) return 'неизвестное устройство'
  return [b ?? 'браузер', s].filter(Boolean).join(', ')
}
