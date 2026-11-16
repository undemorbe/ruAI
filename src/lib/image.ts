/**
 * Подготовка фото перед загрузкой. Сервер принимает JPEG, PNG и WebP; HEIC с iPhone и
 * слишком большие снимки браузер перекодирует в JPEG (заодно без EXIF и геопозиции).
 */
export const SERVER_TYPES = ['image/jpeg', 'image/png', 'image/webp']
/** Модели больше и не нужно: меньше трафика и токенов. */
export const MAX_SIDE = 2048

export function needsReencode(type: string, width: number, height: number): boolean {
  return !SERVER_TYPES.includes(type) || Math.max(width, height) > MAX_SIDE
}

export function fitSize(width: number, height: number, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

/** Возвращает файл для отправки; если браузер не умеет декодировать — исходный (сервер проверит). */
export async function prepareUpload(file: File): Promise<File> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return file
  }
  try {
    if (!needsReencode(file.type, bmp.width, bmp.height)) return file
    const { width, height } = fitSize(bmp.width, bmp.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.88))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } finally {
    bmp.close()
  }
}
