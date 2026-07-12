import { create } from 'zustand'
import { API_BASE } from '../config/api'
import { BADGE_MAP } from '../badges/badgeDefinitions'

export interface AchievementRecord {
    badgeId: string
    unlocked: boolean
    unlockedAt: string | null
}

export interface UserProfile {
    id: number
    username: string
    email: string
    totalXP: number
    level: number
    bio: string
    createdAt: string
}

interface AchievementState {
    achievements: AchievementRecord[]
    pendingUnlocks: string[]
    profile: UserProfile | null

    setAchievements: (records: AchievementRecord[]) => void
    handleNewUnlocks: (ids: string[]) => void
    dismissUnlock: (badgeId: string) => void
    fetchProfile: () => Promise<void>
    syncAchievements: () => Promise<string[]>
    updateBio: (bio: string) => Promise<boolean>
    changePassword: (oldPassword: string, newPassword: string) => Promise<string | null>
    clear: () => void
}

export const useAchievementStore = create<AchievementState>((set, get) => ({
    achievements: [],
    pendingUnlocks: [],
    profile: null,

    setAchievements: (records) => set({ achievements: records }),

    handleNewUnlocks: (ids) => {
        if (!ids.length) return
        set(state => {
            const toShow = ids.filter(id => {
                if (!BADGE_MAP[id]) return false
                const before = state.achievements.find(a => a.badgeId === id)
                return !before?.unlocked
            })
            if (!toShow.length) return state

            const achievements = [...state.achievements]
            for (const id of ids) {
                if (!BADGE_MAP[id]) continue
                const idx = achievements.findIndex(a => a.badgeId === id)
                const entry: AchievementRecord = {
                    badgeId: id,
                    unlocked: true,
                    unlockedAt: new Date().toISOString(),
                }
                if (idx >= 0) achievements[idx] = entry
                else achievements.push(entry)
            }

            return {
                achievements,
                pendingUnlocks: [
                    ...state.pendingUnlocks,
                    ...toShow.filter(id => !state.pendingUnlocks.includes(id)),
                ],
            }
        })
    },

    dismissUnlock: (badgeId) => set(state => ({
        pendingUnlocks: state.pendingUnlocks.filter(id => id !== badgeId),
    })),

    fetchProfile: async () => {
        const token = localStorage.getItem('token')
        if (!token) return

        const res = await fetch(`${API_BASE}/user/me`, {
            headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return

        const data = await res.json()
        set({
            profile: {
                id: data.id,
                username: data.username,
                email: data.email,
                totalXP: data.totalXP,
                level: data.level,
                bio: data.bio ?? '',
                createdAt: data.createdAt,
            },
            achievements: data.achievements ?? [],
        })
    },

    syncAchievements: async () => {
        const token = localStorage.getItem('token')
        if (!token) return []

        const res = await fetch(`${API_BASE}/user/achievements/sync`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return []

        const data = await res.json()
        set({ achievements: data.achievements ?? [] })
        get().handleNewUnlocks(data.newlyUnlocked ?? [])
        return data.newlyUnlocked ?? []
    },

    updateBio: async (bio) => {
        const token = localStorage.getItem('token')
        if (!token) return false

        const res = await fetch(`${API_BASE}/user/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ bio }),
        })
        if (!res.ok) return false

        set(state => ({
            profile: state.profile ? { ...state.profile, bio } : null,
        }))
        return true
    },

    changePassword: async (oldPassword, newPassword) => {
        const token = localStorage.getItem('token')
        if (!token) return '未登录'

        const res = await fetch(`${API_BASE}/user/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ oldPassword, newPassword }),
        })
        if (!res.ok) return await res.text() || '修改失败'
        return null
    },

    clear: () => set({ achievements: [], pendingUnlocks: [], profile: null }),
}))
