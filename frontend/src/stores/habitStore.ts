import { create } from 'zustand'
import type { Habit, CreateHabitPayload } from '../api/habitApi'
import { getHabits, createHabit } from '../api/habitApi'
import { apiFetch, authHeaders, isJwtExpired } from '../api/http'
import { API_BASE } from '../config/api'

interface HabitState {
    habits: Habit[]
    isLoading: boolean
    error: string | null
    todayCheckedHabitIds: number[]
    isLoggedIn: boolean
    currentUser: {
        id: number
        username: string
        totalXP: number
        level: number
        role?: string
    } | null

    fetchHabits: () => Promise<void>
    addHabit: (habit: CreateHabitPayload) => Promise<Habit>
    updateHabit: (id: number, updatedHabit: Partial<Habit>) => Promise<void>
    patchHabitLocal: (id: number, patch: Partial<Habit>) => void
    patchHabitsLocal: (updater: (habits: Habit[]) => Habit[]) => void
    deleteHabit: (id: number) => Promise<void>
    fetchTodayCheckedHabits: () => Promise<void>
    markHabitCheckedToday: (habitId: number) => void
    addXPToCurrentUser: (xpAmount: number) => void
    fetchCurrentUser: () => Promise<void>

    login: (login: string, password: string) => Promise<boolean>
    logout: () => void
}

export const useHabitStore = create<HabitState>((set, get) => {

    let token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('currentUser')

    let initialIsLoggedIn = false
    let initialCurrentUser = null
    let initialHabits: Habit[] = []
    let initialTodayChecked: number[] = []

    if (token && isJwtExpired(token)) {
        localStorage.removeItem('token')
        localStorage.removeItem('currentUser')
        token = null
    }

    if (token && savedUser) {
        try {
            const user = JSON.parse(savedUser)
            initialIsLoggedIn = true
            initialCurrentUser = user
        } catch {
            localStorage.removeItem('token')
            localStorage.removeItem('currentUser')
        }
    } else {
        localStorage.removeItem('currentUser')
        initialHabits = []
        initialTodayChecked = []
    }

    return {
        habits: initialHabits,
        isLoading: false,
        error: null,
        todayCheckedHabitIds: initialTodayChecked,
        isLoggedIn: initialIsLoggedIn,
        currentUser: initialCurrentUser,

        fetchHabits: async () => {
            set({ isLoading: true, error: null })
            try {
                const data = await getHabits()
                set({ habits: data, isLoading: false })
            } catch {
                set({ error: '获取习惯失败', isLoading: false })
            }
        },

        addHabit: async (habit) => {
            try {
                const { habit: newHabit, newlyUnlocked } = await createHabit(habit)
                set((state) => ({
                    habits: [...state.habits, newHabit]
                }))
                if (newlyUnlocked?.length) {
                    const { useAchievementStore } = await import('./achievementStore')
                    useAchievementStore.getState().handleNewUnlocks(newlyUnlocked)
                }
                return newHabit
            } catch (err) {
                set({ error: '创建习惯失败' })
                throw err
            }
        },

        updateHabit: async (id, updatedHabit) => {
            try {
                const res = await apiFetch(`/habit/${id}`, {
                    method: 'PUT',
                    headers: authHeaders(true),
                    body: JSON.stringify(updatedHabit),
                })

                if (!res.ok) throw new Error('更新失败')

                set((state) => ({
                    habits: state.habits.map(h =>
                        h.id === id ? { ...h, ...updatedHabit } : h
                    )
                }))
            } catch {
                alert('更新习惯失败')
            }
        },

        patchHabitLocal: (id, patch) => {
            set((state) => ({
                habits: state.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)),
            }))
        },

        patchHabitsLocal: (updater) => {
            set((state) => ({ habits: updater(state.habits) }))
        },

        deleteHabit: async (id) => {
            try {
                const res = await apiFetch(`/habit/${id}`, { method: 'DELETE' })
                if (!res.ok) throw new Error('删除失败')
                set((state) => ({
                    habits: state.habits.filter(h => h.id !== id)
                }))
            } catch {
                alert('删除习惯失败')
            }
        },

        fetchTodayCheckedHabits: async () => {
            try {
                const res = await apiFetch('/checkin/today')
                if (!res.ok) throw new Error('Failed to fetch today check-ins')
                const habitIds: number[] = await res.json()
                set({ todayCheckedHabitIds: habitIds })
            } catch (err) {
                console.error('获取今日打卡记录失败', err)
            }
        },

        markHabitCheckedToday: (habitId: number) => {
            set((state) => {
                if (state.todayCheckedHabitIds.includes(habitId)) return state
                return {
                    todayCheckedHabitIds: [...state.todayCheckedHabitIds, habitId]
                }
            })
        },

        addXPToCurrentUser: (xpAmount: number) => {
            set((state) => {
                if (!state.currentUser) return state
                const newTotalXP = state.currentUser.totalXP + xpAmount
                const newLevel = Math.floor(newTotalXP / 100) + 1
                const updatedUser = {
                    ...state.currentUser,
                    totalXP: newTotalXP,
                    level: newLevel,
                }
                localStorage.setItem('currentUser', JSON.stringify(updatedUser))
                return { currentUser: updatedUser }
            })
        },

        fetchCurrentUser: async () => {
            try {
                const res = await apiFetch('/user/me')
                if (res.status === 401) return
                if (!res.ok) throw new Error('获取用户信息失败')

                const userData = await res.json()
                const updatedUser = {
                    id: userData.id,
                    username: userData.username,
                    totalXP: userData.totalXP,
                    level: userData.level,
                    role: userData.role ?? userData.Role ?? 'User',
                }

                localStorage.setItem('currentUser', JSON.stringify(updatedUser))
                set({ currentUser: updatedUser, isLoggedIn: true })
            } catch (err) {
                console.error('获取当前用户信息失败', err)
            }
        },

        login: async (login, password) => {
            try {
                const res = await fetch(`${API_BASE}/user/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ login, password }),
                })

                if (!res.ok) {
                    if (res.status === 403) {
                        let message = '账号已被封禁'
                        try {
                            const body = await res.json()
                            if (body.bannedUntil) {
                                message = `账号已被封禁至 ${new Date(body.bannedUntil).toLocaleString()}`
                            } else if (body.message) {
                                message = body.message
                            }
                        } catch { /* ignore */ }
                        throw new Error(message)
                    }
                    return false
                }

                const data = await res.json()
                localStorage.setItem('token', data.token)

                const userInfo = {
                    id: data.user.id,
                    username: data.user.username,
                    totalXP: data.user.totalXP,
                    level: data.user.level,
                    role: data.user.role ?? 'User',
                }
                localStorage.setItem('currentUser', JSON.stringify(userInfo))

                set({
                    isLoggedIn: true,
                    currentUser: userInfo,
                })

                const { useAiSettingsStore } = await import('./aiSettingsStore')
                useAiSettingsStore.getState().hydrateForUser(userInfo.id)

                const { useTrustStore } = await import('./trustStore')
                void useTrustStore.getState().hydrate()

                const { useAchievementStore } = await import('./achievementStore')
                const achStore = useAchievementStore.getState()
                await achStore.fetchProfile()
                if (data.newlyUnlocked?.length) {
                    achStore.handleNewUnlocks(data.newlyUnlocked)
                }

                await get().fetchHabits()
                await get().fetchTodayCheckedHabits()

                return true
            } catch (err) {
                if (err instanceof Error && err.message.includes('封禁')) {
                    alert(err.message)
                } else {
                    alert('登录出错，请稍后重试')
                }
                return false
            }
        },

        logout: () => {
            localStorage.removeItem('token')
            localStorage.removeItem('currentUser')
            import('./achievementStore').then(({ useAchievementStore }) => {
                useAchievementStore.getState().clear()
            })
            import('./aiSettingsStore').then(({ useAiSettingsStore }) => {
                useAiSettingsStore.getState().hydrateForUser(null)
            })
            import('./companionStore').then(({ useCompanionStore }) => {
                useCompanionStore.getState().hydrateForUser(null)
            })
            import('./affectionStore').then(({ useAffectionStore }) => {
                useAffectionStore.getState().clear()
            })
            import('./trustStore').then(({ useTrustStore }) => {
                useTrustStore.getState().clear()
            })
            set({
                isLoggedIn: false,
                currentUser: null,
                habits: [],
                todayCheckedHabitIds: [],
                error: null,
            })
        },
    }
})
