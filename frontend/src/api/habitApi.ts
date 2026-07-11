import type { CreateHabitPayload, Habit } from '../utils/habitHelpers'

const API_BASE = 'http://localhost:5000/api'

function authHeaders(json = false): HeadersInit {
    const token = localStorage.getItem('token')
    const headers: HeadersInit = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (json) headers['Content-Type'] = 'application/json'
    return headers
}

export type { Habit, CreateHabitPayload } from '../utils/habitHelpers'

export async function getHabits(): Promise<Habit[]> {
    const res = await fetch(`${API_BASE}/habit`, {
        method: 'GET',
        headers: authHeaders(),
    })

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || 'Failed to fetch habits')
    }

    return res.json()
}

export async function getAllHabits(includeInactive = false): Promise<Habit[]> {
    const url = includeInactive
        ? `${API_BASE}/habit?includeInactive=true`
        : `${API_BASE}/habit`

    const res = await fetch(url, { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to fetch habits')
    return res.json()
}

export async function createHabit(payload: CreateHabitPayload): Promise<Habit> {
    const res = await fetch(`${API_BASE}/habit`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
    })

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || 'Failed to create habit')
    }

    return res.json()
}

export async function updateHabit(id: number, data: Partial<Habit>): Promise<void> {
    const res = await fetch(`${API_BASE}/habit/${id}`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('更新失败')
}

export async function deleteHabit(id: number): Promise<void> {
    const res = await fetch(`${API_BASE}/habit/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
    })
    if (!res.ok) throw new Error('删除失败')
}
