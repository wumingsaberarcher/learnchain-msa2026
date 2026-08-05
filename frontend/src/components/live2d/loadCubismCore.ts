export function loadCubismCore(src = '/lib/live2dcubismcore.min.js'): Promise<void> {
  if (typeof window !== 'undefined' && 'Live2DCubismCore' in window) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-cubism-core="1"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Cubism Core failed to load')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.cubismCore = '1'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load Cubism Core from ${src}`))
    document.head.appendChild(script)
  })
}
