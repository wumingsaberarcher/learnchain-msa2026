import { create } from 'zustand'

export interface FocusSessionTarget {
    habitId: number
    habitName: string
    difficulty: number
    baseXP: number
    milestoneId?: number
    milestoneTitle?: string
}

interface FocusModeState {
    isActive: boolean
    phase: 'setup' | 'running'
    target: FocusSessionTarget | null
    estimatedMinutes: number
    startedAt: number | null
    /** Wall-clock seconds elapsed while running (updated by overlay tick). */
    elapsedSeconds: number
    startSetup: (target: FocusSessionTarget) => void
    setEstimatedMinutes: (minutes: number) => void
    beginSession: () => void
    setElapsedSeconds: (seconds: number) => void
    endSession: () => void
}

const DEFAULT_ESTIMATE = 25

export function focusBonusXp(difficulty: number): number {
    const base = difficulty === 3 ? 30 : difficulty === 2 ? 20 : 10
    return Math.max(5, Math.floor(base / 2))
}

export const useFocusModeStore = create<FocusModeState>((set) => ({
    isActive: false,
    phase: 'setup',
    target: null,
    estimatedMinutes: DEFAULT_ESTIMATE,
    startedAt: null,
    elapsedSeconds: 0,

    startSetup: (target) => set({
        isActive: true,
        phase: 'setup',
        target,
        estimatedMinutes: DEFAULT_ESTIMATE,
        startedAt: null,
        elapsedSeconds: 0,
    }),

    setEstimatedMinutes: (minutes) => set({
        estimatedMinutes: Math.min(240, Math.max(1, Math.round(minutes))),
    }),

    beginSession: () => set({
        phase: 'running',
        startedAt: Date.now(),
        elapsedSeconds: 0,
    }),

    setElapsedSeconds: (seconds) => set({ elapsedSeconds: Math.max(0, seconds) }),

    endSession: () => set({
        isActive: false,
        phase: 'setup',
        target: null,
        startedAt: null,
        elapsedSeconds: 0,
        estimatedMinutes: DEFAULT_ESTIMATE,
    }),
}))
