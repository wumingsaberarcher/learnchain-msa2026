import { API_BASE } from '../config/api'

export interface CheckInPayload {
    habitId: number
    milestoneId?: number
    notes?: string
    fromFocusMode?: boolean
    focusSeconds?: number
    estimatedMinutes?: number
}

export interface CheckInResult {
    id: number
    habitId: number
    userId: number
    completedAt: string
    xpEarned: number
    baseXp?: number
    focusBonusXp?: number
    notes?: string
    milestoneId?: number
    newlyUnlocked?: string[]
}

export async function createCheckIn(payload: CheckInPayload): Promise<CheckInResult> {
    const token = localStorage.getItem('token')
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${API_BASE}/checkin`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    })
    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || 'Failed to check in')
    }
    const data = await res.json()
    return {
        id: data.id ?? data.Id,
        habitId: data.habitId ?? data.HabitId,
        userId: data.userId ?? data.UserId,
        completedAt: data.completedAt ?? data.CompletedAt,
        xpEarned: data.xpEarned ?? data.XPEarned ?? 0,
        baseXp: data.baseXp ?? data.BaseXp,
        focusBonusXp: data.focusBonusXp ?? data.FocusBonusXp ?? 0,
        notes: data.notes ?? data.Notes,
        milestoneId: data.milestoneId ?? data.MilestoneId,
        newlyUnlocked: data.newlyUnlocked ?? data.NewlyUnlocked ?? [],
    }
}

export async function getAllCheckIns() {
    const token = localStorage.getItem('token')
    const headers: HeadersInit = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${API_BASE}/checkin`, { headers })
    if (!res.ok) throw new Error('Failed to fetch check-ins')
    return res.json()
}

export async function getTodayCheckedHabitIds(): Promise<number[]> {
    const token = localStorage.getItem('token')
    const headers: HeadersInit = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const res = await fetch(`${API_BASE}/checkin/today`, { headers })
    if (!res.ok) throw new Error('Failed to fetch today check-ins')
    return res.json()
}
