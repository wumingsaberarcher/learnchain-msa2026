// Prefer same-origin `/api` in production so Vercel can proxy to Render (no browser CORS).
// Set Vercel env: VITE_API_BASE=/api
// Local Vite uses /api via vite.config proxy → localhost:5000.
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')
