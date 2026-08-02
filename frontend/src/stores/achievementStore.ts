import { create } from 'zustand'
import { BADGE_MAP } from '../badges/badgeDefinitions'
import { apiFetch, authHeaders, getAuthToken } from '../api/http'

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
        if (!getAuthToken()) return

        const res = await apiFetch('/user/me')
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
        if (!getAuthToken()) return []

        const res = await apiFetch('/user/achievements/sync', { method: 'POST' })
        if (!res.ok) return []

        const data = await res.json()
        set({ achievements: data.achievements ?? [] })
        get().handleNewUnlocks(data.newlyUnlocked ?? [])
        return data.newlyUnlocked ?? []
    },

    updateBio: async (bio) => {
        if (!getAuthToken()) return false

        const res = await apiFetch('/user/profile', {
            method: 'PUT',
            headers: authHeaders(true),
            body: JSON.stringify({ bio }),
        })
        if (!res.ok) return false

        set(state => ({
            profile: state.profile ? { ...state.profile, bio } : null,
        }))
        return true
    },

    changePassword: async (oldPassword, newPassword) => {
        if (!getAuthToken()) return '未登录'

        const res = await apiFetch('/user/change-password', {
            method: 'POST',
            headers: authHeaders(true),
            body: JSON.stringify({ oldPassword, newPassword }),
        })
        if (!res.ok) return await res.text() || '修改失败'
        return null
    },

    clear: () => set({ achievements: [], pendingUnlocks: [], profile: null }),
}))
