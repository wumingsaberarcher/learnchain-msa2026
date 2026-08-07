import { API_BASE } from '../config/api'

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** True when the API host answers at all (401/404/200 all count as awake). */
async function probeBackend(timeoutMs = 6000): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/habit`, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
    })
    return res.status > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

let sharedWake: Promise<void> | null = null

/**
 * Wait until Render (or local API) responds. Coalesces concurrent callers into one wake loop.
 */
export async function ensureBackendReady(options?: {
  timeoutMs?: number
  onWaiting?: (elapsedMs: number) => void
}): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 90_000
  if (await probeBackend(5000)) return

  if (!sharedWake) {
    sharedWake = (async () => {
      const started = Date.now()
      let delay = 700
      while (Date.now() - started < timeoutMs) {
        options?.onWaiting?.(Date.now() - started)
        if (await probeBackend(8000)) return
        await sleep(delay)
        delay = Math.min(Math.round(delay * 1.35), 3500)
      }
      throw new Error('服务器唤醒超时，请稍后再试')
    })().finally(() => {
      sharedWake = null
    })
  } else {
    options?.onWaiting?.(0)
  }

  await sharedWake
}

/** Run an upload/network action after the backend is up; retry a few times on connection drops. */
export async function withBackendReady<T>(
  action: () => Promise<T>,
  options?: {
    retries?: number
    onWaiting?: (elapsedMs: number) => void
    onRetry?: (attempt: number, error: unknown) => void
  },
): Promise<T> {
  await ensureBackendReady({ onWaiting: options?.onWaiting })
  const retries = options?.retries ?? 3
  let lastErr: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await action()
    } catch (err) {
      lastErr = err
      const transient =
        err instanceof TypeError
        || (err instanceof Error && /failed to fetch|network|唤醒|timeout|超时/i.test(err.message))
      if (!transient || attempt >= retries) throw err
      options?.onRetry?.(attempt, err)
      await ensureBackendReady({ onWaiting: options?.onWaiting })
      await sleep(400 * attempt)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
