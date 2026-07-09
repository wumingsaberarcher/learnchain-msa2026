const API_BASE = 'http://localhost:5000/api'

export interface Habit {
    id: number
    userId: number
    name: string
    description?: string
    frequency: string
    completionType: number
    targetValue?: number
    baseXP: number
    isActive: boolean
    createdAt: string
    isCheckedToday: boolean     // ← 新增这个字段
}

// 获取所有习惯
export async function getHabits(): Promise<Habit[]> {
    const res = await fetch(`${API_BASE}/habit`)
    if (!res.ok) throw new Error('Failed to fetch habits')
    return res.json()
}

// 创建习惯
export async function createHabit(habit: Omit<Habit, 'id' | 'createdAt'>): Promise<Habit> {
    const token = localStorage.getItem('token')

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    const res = await fetch(`${API_BASE}/habit`, {
        method: 'POST',
        headers,
        body: JSON.stringify(habit),
    })

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || 'Failed to create habit')
    }

    return res.json()
}