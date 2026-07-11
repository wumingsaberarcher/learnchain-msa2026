export type HabitType = 'Daily' | 'EveryOtherDay' | 'Weekly' | 'OneTime'

export interface HabitMilestone {
    id: number
    habitId: number
    title: string
    dueDate: string
    xpValue: number
    isCompleted: boolean
    sortOrder: number
}

export interface Habit {
    id: number
    userId: number
    name: string
    description?: string
    frequency: string
    habitType: HabitType
    difficulty: number
    dueDate?: string
    isCompleted: boolean
    completionType: number
    targetValue?: number
    baseXP: number
    isActive: boolean
    createdAt: string
    isCheckedToday: boolean
    isDueToday: boolean
    currentStreak: number
    milestones: HabitMilestone[]
}

export interface CreateMilestonePayload {
    title: string
    dueDate: string
    xpValue: number
    sortOrder: number
}

export interface CreateHabitPayload {
    name: string
    habitType: HabitType
    difficulty: number
    dueDate?: string
    milestones?: CreateMilestonePayload[]
}

export function getDifficultyXP(difficulty: number): number {
    if (difficulty === 2) return 20
    if (difficulty === 3) return 30
    return 10
}

export function getDefaultMilestoneXP(difficulty: number): number {
    return Math.max(5, Math.round(getDifficultyXP(difficulty) * 0.4))
}

export function getHabitTypeLabel(type: string): string {
    switch (type) {
        case 'EveryOtherDay': return '每两天'
        case 'Weekly': return '每周'
        case 'OneTime': return '一次性'
        default: return '每日'
    }
}

export function getDifficultyLabel(difficulty: number): string {
    switch (difficulty) {
        case 2: return '中等'
        case 3: return '困难'
        default: return '简单'
    }
}

export function daysUntil(dateStr?: string): number | null {
    if (!dateStr) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(dateStr)
    target.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function formatCountdown(dateStr?: string): string {
    const days = daysUntil(dateStr)
    if (days === null) return ''
    if (days < 0) return `已逾期 ${Math.abs(days)} 天`
    if (days === 0) return '今天截止'
    return `还剩 ${days} 天`
}

export function getPendingMilestones(habit: Habit) {
    return (habit.milestones || []).filter(m => !m.isCompleted)
}

export function getDueMilestonesToday(habit: Habit) {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    return getPendingMilestones(habit).filter(m => new Date(m.dueDate) <= today)
}
