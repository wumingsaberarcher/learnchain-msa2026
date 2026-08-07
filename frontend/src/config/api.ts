// Prefer same-origin `/api` in production so Vercel can proxy to Render (no browser CORS).
// Set Vercel env: VITE_API_BASE=/api
// Local Vite uses /api via vite.config proxy → localhost:5000.
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')

/** Absolute Render API — only used as fallback for large bodies (Vercel proxy ~4.5MB). */
export const RENDER_API_BASE = (
  (import.meta.env.VITE_UPLOAD_API_BASE as string | undefined)?.trim()
  || 'https://learnchain-msa2026.onrender.com/api'
).replace(/\/$/, '')

/** Prefer same-origin; use direct Render only when the file may exceed Vercel’s proxy limit. */
export function resolveUploadApiBase(fileSizeBytes: number): string {
  const explicit = (import.meta.env.VITE_UPLOAD_API_BASE as string | undefined)?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  if (API_BASE.startsWith('http')) return API_BASE
  // Stay on same-origin for normal docs (txt/md/small pdf) — this path was working before.
  if (fileSizeBytes <= 3.5 * 1024 * 1024) return API_BASE
  return RENDER_API_BASE
}
