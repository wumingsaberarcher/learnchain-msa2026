import { create } from 'zustand'
import type { Habit, CreateHabitPayload } from '../api/habitApi'
import { getHabits, createHabit } from '../api/habitApi'

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
    } | null

    fetchHabits: () => Promise<void>
    addHabit: (habit: CreateHabitPayload) => Promise<Habit>
    updateHabit: (id: number, updatedHabit: Partial<Habit>) => Promise<void>
    deleteHabit: (id: number) => Promise<void>
    fetchTodayCheckedHabits: () => Promise<void>
    markHabitCheckedToday: (habitId: number) => void
    addXPToCurrentUser: (xpAmount: number) => void
    fetchCurrentUser: () => Promise<void>

    login: (username: string, password: string) => Promise<boolean>
    logout: () => void
}

export const useHabitStore = create<HabitState>((set, get) => {

    // ====================== 初始化登录状态（最终加强版） ======================
    const token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('currentUser')

    let initialIsLoggedIn = false
    let initialCurrentUser = null
    let initialHabits: Habit[] = []
    let initialTodayChecked: number[] = []

    if (token && savedUser) {
        try {
            const user = JSON.parse(savedUser)
            initialIsLoggedIn = true
            initialCurrentUser = user
        } catch (e) {
            localStorage.removeItem('token')
            localStorage.removeItem('currentUser')
        }
    } else {
        // 没有 token 时，强制清空所有旧数据
        localStorage.removeItem('currentUser')
        initialHabits = []
        initialTodayChecked = []
    }
    // =====================================================================

    return {
        habits: initialHabits,
        todayCheckedHabitIds: initialTodayChecked,
        isLoggedIn: initialIsLoggedIn,
        currentUser: initialCurrentUser,

        fetchHabits: async () => {
            set({ isLoading: true, error: null })
            try {
                const data = await getHabits()
                set({ habits: data, isLoading: false })
            } catch (err) {
                set({ error: '获取习惯失败', isLoading: false })
            }
        },

        addHabit: async (habit) => {
            try {
                const newHabit = await createHabit(habit)
                set((state) => ({
                    habits: [...state.habits, newHabit]
                }))
                return newHabit
            } catch (err) {
                set({ error: '创建习惯失败' })
                throw err   // ← 关键：重新抛出错误，让组件能捕获
            }
        },

        updateHabit: async (id, updatedHabit) => {
            try {
                const token = localStorage.getItem('token')
                const res = await fetch(`http://localhost:5000/api/habit/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token && { Authorization: `Bearer ${token}` }),
                    },
                    body: JSON.stringify(updatedHabit),
                })

                if (!res.ok) throw new Error('更新失败')

                set((state) => ({
                    habits: state.habits.map(h =>
                        h.id === id ? { ...h, ...updatedHabit } : h
                    )
                }))
            } catch (err) {
                alert('更新习惯失败')
            }
        },

        deleteHabit: async (id) => {
            try {
                const token = localStorage.getItem('token')
                const res = await fetch(`http://localhost:5000/api/habit/${id}`, {
                    method: 'DELETE',
                    headers: {
                        ...(token && { Authorization: `Bearer ${token}` }),
                    },
                })

                if (!res.ok) throw new Error('删除失败')

                set((state) => ({
                    habits: state.habits.filter(h => h.id !== id)
                }))
            } catch (err) {
                alert('删除习惯失败')
            }
        },

        fetchTodayCheckedHabits: async () => {
            try {
                const token = localStorage.getItem('token')

                const headers: HeadersInit = {}
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`
                }

                const res = await fetch('http://localhost:5000/api/checkin/today', {
                    headers,
                })

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
                const token = localStorage.getItem('token')
                if (!token) return

                const res = await fetch('http://localhost:5000/api/user/me', {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                })

                if (!res.ok) throw new Error('获取用户信息失败')

                const userData = await res.json()

                const updatedUser = {
                    id: userData.id,
                    username: userData.username,
                    totalXP: userData.totalXP,
                    level: userData.level,
                }

                localStorage.setItem('currentUser', JSON.stringify(updatedUser))
                set({ currentUser: updatedUser })

            } catch (err) {
                console.error('获取当前用户信息失败', err)
            }
        },

        login: async (username, password) => {
            try {
                const res = await fetch('http://localhost:5000/api/user/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                })

                if (!res.ok) {
                    alert('登录失败，用户名或密码错误')
                    return false
                }

                const data = await res.json()
                localStorage.setItem('token', data.token)

                const userInfo = {
                    id: data.user.id,
                    username: data.user.username,
                    totalXP: data.user.totalXP,
                    level: data.user.level,
                }
                localStorage.setItem('currentUser', JSON.stringify(userInfo))

                set({
                    isLoggedIn: true,
                    currentUser: userInfo,
                })

                await get().fetchHabits()
                await get().fetchTodayCheckedHabits()

                return true
            } catch (err) {
                alert('登录出错，请稍后重试')
                return false
            }
        },

        logout: () => {
            localStorage.removeItem('token')
            localStorage.removeItem('currentUser')
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