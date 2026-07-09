const API_BASE = 'http://localhost:5000/api'

export interface CheckInPayload {
    habitId: number
    userId: number
    notes?: string
}

export async function createCheckIn(payload: CheckInPayload) {
    const token = localStorage.getItem('token')

    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

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

// 获取所有打卡记录（后面可以优化成分页或按日期查询）
export async function getAllCheckIns() {
    const res = await fetch(`${API_BASE}/checkin`)
    if (!res.ok) throw new Error('Failed to fetch check-ins')
    return res.json()
}