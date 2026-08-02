import { apiFetch, authHeaders } from './http'

export function isStaffRole(role?: string | null) {
    return role === 'Admin' || role === 'SuperAdmin'
}

export function isSuperAdminRole(role?: string | null) {
    return role === 'SuperAdmin'
}

export function isProtectedStaffRole(role?: string | null) {
    return role === 'Admin' || role === 'SuperAdmin'
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
    /** SuperAdmin-only fields */
    dailyDigestEnabled?: boolean
    password?: string | null
    passwordAvailable?: boolean
    hasPendingReset?: boolean
    viewerIsSuperAdmin?: boolean
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
    const path = q?.trim()
        ? `/admin/users?q=${encodeURIComponent(q.trim())}`
        : '/admin/users'
    const res = await apiFetch(path)
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function getAdminUser(id: number): Promise<AdminUserDetail> {
    const res = await apiFetch(`/admin/users/${id}`)
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function setUserXp(id: number, totalXP: number) {
    const res = await apiFetch(`/admin/users/${id}/xp`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({ totalXP }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function grantBadge(id: number, badgeId: string) {
    const res = await apiFetch(`/admin/users/${id}/badges`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ badgeId }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function revokeBadge(id: number, badgeId: string) {
    const res = await apiFetch(`/admin/users/${id}/badges/${encodeURIComponent(badgeId)}`, {
        method: 'DELETE',
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function banUser(id: number, hours: number) {
    const res = await apiFetch(`/admin/users/${id}/ban`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({ hours }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function unbanUser(id: number) {
    const res = await apiFetch(`/admin/users/${id}/unban`, {
        method: 'POST',
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

export async function deleteUser(id: number) {
    const res = await apiFetch(`/admin/users/${id}`, {
        method: 'DELETE',
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

/** SuperAdmin: set role to Admin or User. */
export async function setUserRole(id: number, role: 'Admin' | 'User') {
    const res = await apiFetch(`/admin/users/${id}/role`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({ role }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}

/** SuperAdmin: set password and receive it back once. */
export async function setUserPassword(id: number, password: string) {
    const res = await apiFetch(`/admin/users/${id}/password`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({ password }),
    })
    if (!res.ok) throw new Error(await readError(res))
    return res.json() as Promise<{ message: string; password: string }>
}

export async function listBadgeIds(): Promise<string[]> {
    const res = await apiFetch('/admin/badges')
    if (!res.ok) throw new Error(await readError(res))
    return res.json()
}
