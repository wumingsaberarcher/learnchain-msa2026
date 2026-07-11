import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useHabitStore } from '../stores/habitStore'

const initialState = {
  habits: [],
  isLoading: false,
  error: null,
  todayCheckedHabitIds: [] as number[],
  isLoggedIn: false,
  currentUser: null,
}

describe('habitStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useHabitStore.setState(initialState)
  })

  it('markHabitCheckedToday adds habit id without duplicates', () => {
    useHabitStore.getState().markHabitCheckedToday(1)
    useHabitStore.getState().markHabitCheckedToday(1)
    useHabitStore.getState().markHabitCheckedToday(2)

    expect(useHabitStore.getState().todayCheckedHabitIds).toEqual([1, 2])
  })

  it('addXPToCurrentUser updates totalXP and level', () => {
    useHabitStore.setState({
      currentUser: { id: 1, username: 'test', totalXP: 90, level: 1 },
      isLoggedIn: true,
    })

    useHabitStore.getState().addXPToCurrentUser(20)

    const user = useHabitStore.getState().currentUser
    expect(user?.totalXP).toBe(110)
    expect(user?.level).toBe(2)
    expect(JSON.parse(localStorage.getItem('currentUser')!).totalXP).toBe(110)
  })

  it('addXPToCurrentUser does nothing when not logged in', () => {
    useHabitStore.getState().addXPToCurrentUser(50)
    expect(useHabitStore.getState().currentUser).toBeNull()
  })

  it('logout clears session and store state', () => {
    localStorage.setItem('token', 'fake-token')
    localStorage.setItem('currentUser', JSON.stringify({ id: 1, username: 'u', totalXP: 0, level: 1 }))
    useHabitStore.setState({
      isLoggedIn: true,
      currentUser: { id: 1, username: 'u', totalXP: 0, level: 1 },
      habits: [{ id: 1 } as any],
      todayCheckedHabitIds: [1],
    })

    useHabitStore.getState().logout()

    expect(useHabitStore.getState().isLoggedIn).toBe(false)
    expect(useHabitStore.getState().habits).toEqual([])
    expect(useHabitStore.getState().todayCheckedHabitIds).toEqual([])
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('fetchHabits loads habits from API', async () => {
    const mockHabits = [
      {
        id: 1,
        userId: 1,
        name: 'Read',
        frequency: '每日',
        habitType: 'Daily',
        difficulty: 1,
        isCompleted: false,
        completionType: 0,
        baseXP: 10,
        isActive: true,
        createdAt: '2026-01-01',
        isCheckedToday: false,
        isDueToday: true,
        currentStreak: 0,
        milestones: [],
      },
    ]

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockHabits,
    }))

    await useHabitStore.getState().fetchHabits()

    expect(useHabitStore.getState().habits).toHaveLength(1)
    expect(useHabitStore.getState().habits[0].name).toBe('Read')
    expect(useHabitStore.getState().isLoading).toBe(false)
  })
})
