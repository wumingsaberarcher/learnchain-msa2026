import type { CreateHabitPayload, Habit } from '../utils/habitHelpers'
import { apiFetch, authHeaders } from './http'

export type { Habit, CreateHabitPayload } from '../utils/habitHelpers'

export async function getHabits(): Promise<Habit[]> {
    const res = await apiFetch('/habit', { method: 'GET' })

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || 'Failed to fetch habits')
    }

    return res.json()
}

export async function getAllHabits(includeInactive = false): Promise<Habit[]> {
    const path = includeInactive ? '/habit?includeInactive=true' : '/habit'
    const res = await apiFetch(path)
    if (!res.ok) throw new Error('Failed to fetch habits')
    return res.json()
}

export async function createHabit(payload: CreateHabitPayload): Promise<{ habit: Habit; newlyUnlocked?: string[] }> {
    let res: Response
    try {
        res = await apiFetch('/habit', {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify(payload),
        })
    } catch (err) {
        if (err instanceof TypeError) {
            throw new Error(
                '无法连接服务器（Failed to fetch）。请确认后端已唤醒，或在 Vercel 设置 VITE_API_BASE=https://learnchain-msa2026.onrender.com/api',
            )
        }
        throw err
    }

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || 'Failed to create habit')
    }

    const data = await res.json()
    return { habit: data.habit ?? data, newlyUnlocked: data.newlyUnlocked }
}

export async function updateHabit(
  id: number,
  data: Partial<{
    name: string
    assessmentEnabled: boolean
    assessmentDifficulty: string
    setGroupId: boolean
    groupId: number | null
  }>,
): Promise<void> {
  const res = await apiFetch(`/habit/${id}`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('更新失败')
}

export async function deleteHabit(id: number): Promise<void> {
    const res = await apiFetch(`/habit/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('删除失败')
}
