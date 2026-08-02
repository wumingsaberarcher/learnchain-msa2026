import { API_BASE } from '../config/api'

export class AuthError extends Error {
  readonly status = 401
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'AuthError'
  }
}

/** Decode JWT exp without verifying signature (client-side session hygiene only). */
export function isJwtExpired(token: string, skewSeconds = 60): boolean {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return true
    const json = atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))
    const payload = JSON.parse(json) as { exp?: number }
    if (typeof payload.exp !== 'number') return false
    return Date.now() >= payload.exp * 1000 - skewSeconds * 1000
  } catch {
    return true
  }
}

let handlingUnauthorized = false

/** Clear sticky localStorage session and sync habitStore logout (idempotent). */
export function handleUnauthorized(): void {
  if (handlingUnauthorized) return
  handlingUnauthorized = true
  try {
    localStorage.removeItem('token')
    localStorage.removeItem('currentUser')
  } catch {
    /* ignore */
  }
  void import('../stores/habitStore')
    .then(({ useHabitStore }) => {
      const s = useHabitStore.getState()
      if (s.isLoggedIn) s.logout()
    })
    .finally(() => {
      handlingUnauthorized = false
    })
}

export function getAuthToken(): string | null {
  try {
    const token = localStorage.getItem('token')
    if (!token) return null
    if (isJwtExpired(token)) {
      handleUnauthorized()
      return null
    }
    return token
  } catch {
    return null
  }
}

export function authHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {}
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

/**
 * Authenticated fetch: attaches Bearer token, logs out on 401 / expired JWT.
 * Login/register should use plain `fetch`, not this helper.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const token = getAuthToken()

  const headers = new Headers(init.headers)
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(url, { ...init, headers })
  if (res.status === 401 && (token || localStorage.getItem('token'))) {
    handleUnauthorized()
  }
  return res
}
