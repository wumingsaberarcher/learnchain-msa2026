// Prefer same-origin `/api` in production so Vercel can proxy to Render (no browser CORS).
// Set Vercel env: VITE_API_BASE=/api
// Local Vite uses /api via vite.config proxy → localhost:5000.
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')

/**
 * Absolute API base for large multipart uploads.
 * Vercel’s rewrite proxy caps request bodies (~4.5MB); PDFs often exceed that.
 * Browser → Render directly (CORS already AllowAnyOrigin).
 */
export function resolveUploadApiBase(): string {
  const explicit = import.meta.env.VITE_UPLOAD_API_BASE as string | undefined
  if (explicit?.trim()) return explicit.replace(/\/$/, '')
  if (API_BASE.startsWith('http')) return API_BASE
  // Local vite proxy has no 4.5MB cap
  if (import.meta.env.DEV) return API_BASE
  return 'https://learnchain-msa2026.onrender.com/api'
}
