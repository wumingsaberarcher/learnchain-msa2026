/** Compress an image File to a JPEG data URL suitable for vision chat. */
export async function compressChatImage(
  file: File,
  maxSide = 1024,
  quality = 0.72,
  /** Max data-URL string length (~base64). Keep under ~700KB for proxy-friendly POSTs. */
  maxDataUrlChars = 700_000,
): Promise<{ dataUrl: string; mime: string; base64: string }> {
  if (!file.type.startsWith('image/') && file.type !== '') {
    throw new Error('not_image')
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    let scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    let w = Math.max(1, Math.round(img.width * scale))
    let h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')

    let q = quality
    let dataUrl = ''
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = w
      canvas.height = h
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      dataUrl = canvas.toDataURL('image/jpeg', q)
      if (dataUrl.length <= maxDataUrlChars) break
      if (q > 0.45) {
        q -= 0.1
      } else {
        w = Math.max(1, Math.round(w * 0.75))
        h = Math.max(1, Math.round(h * 0.75))
        q = 0.65
      }
    }
    if (!dataUrl || dataUrl.length > maxDataUrlChars) throw new Error('too_large')

    const comma = dataUrl.indexOf(',')
    const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
    if (!base64) throw new Error('encode')
    return { dataUrl, mime: 'image/jpeg', base64 }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('decode'))
    img.src = src
  })
}

/** Split a data URL into mime + base64 for the chat API. */
export function splitDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl.trim())
  if (!m) return null
  return { mime: m[1]!.toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1]!.toLowerCase(), base64: m[2]! }
}
