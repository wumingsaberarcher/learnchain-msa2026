/** Compress an image File to a JPEG data URL suitable for vision chat. */
export async function compressChatImage(
  file: File,
  maxSide = 1280,
  quality = 0.82,
  maxBytes = 1_600_000,
): Promise<{ dataUrl: string; mime: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('not_image')
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.drawImage(img, 0, 0, w, h)

    let q = quality
    let dataUrl = canvas.toDataURL('image/jpeg', q)
    while (dataUrl.length > maxBytes && q > 0.45) {
      q -= 0.1
      dataUrl = canvas.toDataURL('image/jpeg', q)
    }
    if (dataUrl.length > maxBytes) throw new Error('too_large')
    return { dataUrl, mime: 'image/jpeg' }
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
