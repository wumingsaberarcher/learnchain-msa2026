import { API_BASE } from '../config/api'

function authHeaders(json = false): HeadersInit {
    const token = localStorage.getItem('token')
    const headers: HeadersInit = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (json) headers['Content-Type'] = 'application/json'
    return headers
}

export interface AdminUserSummary {
    id: number
    username: string
    email: string
    totalXP: number
    level: number
    role: string
    createdAt: string
    bannedUntil?: string | null
    isBanned: boolean
    habitCount: number
    badgeCount: number
}

export interface AdminUserDetail extends Omit<AdminUserSummary, 'habitCount' | 'badgeCount'> {
    bio?: string
    achievements: { badgeId: string; unlocked: boolean; unlockedAt?: string | null }[]
}

async function readError(res: Response) {
    const text = await res.text()
    try {
        const j = JSON.parse(text)
        return j.message || text
    } catch {
        return text || res.statusText
    }
}

export async function listAdminUsers(q?: string): Promise<AdminUserSummary[]> {
    const url = q?.trim()
        ? `${API_BASE}/admin/users?q=${encodeURIComponent(q.trim())}`
        : `${API_BASE}/admin/users`
    const res = await fetch(url, { headers: authHeaders() })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function getAdminUser(id: number): Promise<AdminUserDetail> {
    const res = await fetch(`${API_BASE}/admin/users/${id}`, { headers: authHeaders() })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function setUserXp(id: number, totalXP: number) {
    const res = await fetch(`${API_BASE}/admin/users/${id}/xp`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({ totalXP }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function grantBadge(id: number, badgeId: string) {
    const res = await fetch(`${API_BASE}/admin/users/${id}/badges`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ badgeId }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function revokeBadge(id: number, badgeId: string) {
    const res = await fetch(`${API_BASE}/admin/users/${id}/badges/${encodeURIComponent(badgeId)}`, {
        method: 'DELETE',
        headers: authHeaders(),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

/** Ban for a duration in hours (1–720 / max 30 days). */
export async function banUser(id: number, hours: number) {
    const res = await fetch(`${API_BASE}/admin/users/${id}/ban`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ hours }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function unbanUser(id: number) {
    const res = await fetch(`${API_BASE}/admin/users/${id}/unban`, {
        method: 'POST',
        headers: authHeaders(),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function deleteUser(id: number) {
    const res = await fetch(`${API_BASE}/admin/users/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function listBadgeIds(): Promise<string[]> {
    const res = await fetch(`${API_BASE}/admin/badges`, { headers: authHeaders() })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}
