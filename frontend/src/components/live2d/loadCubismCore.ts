let loading: Promise<void> | null = null

export function loadCubismCore(src = '/lib/live2dcubismcore.min.js'): Promise<void> {
  if (typeof window !== 'undefined' && window.Live2DCubismCore) {
    return Promise.resolve()
  }

  if (loading) return loading

  loading = new Promise<void>((resolve, reject) => {
    if (typeof window !== 'undefined' && window.Live2DCubismCore) {
      resolve()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-cubism-core="1"]')
      ?? document.querySelector<HTMLScriptElement>('script[src*="live2dcubismcore"]')

    if (existing) {
      if (window.Live2DCubismCore) {
        resolve()
        return
      }
      existing.addEventListener('load', () => {
        if (window.Live2DCubismCore) resolve()
        else reject(new Error('Cubism Core script loaded but Live2DCubismCore is missing'))
      }, { once: true })
      existing.addEventListener('error', () => reject(new Error('Cubism Core failed to load')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.dataset.cubismCore = '1'
    script.onload = () => {
      if (window.Live2DCubismCore) resolve()
      else reject(new Error('Cubism Core script loaded but Live2DCubismCore is missing'))
    }
    script.onerror = () => reject(new Error(`Failed to load Cubism Core from ${src}`))
    document.head.appendChild(script)
  })

  return loading
}
