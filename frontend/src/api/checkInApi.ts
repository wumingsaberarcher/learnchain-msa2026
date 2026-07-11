import { API_BASE } from '../config/api'

export interface CheckInPayload {
    habitId: number
    milestoneId?: number
    notes?: string
}

export async function createCheckIn(payload: CheckInPayload) {
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
    return res.json()
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
