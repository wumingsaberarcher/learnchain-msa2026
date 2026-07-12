import type { Habit } from './habitHelpers'

export interface CalendarCheckIn {
    habitId: number
    completedAt: string
    milestoneId?: number | null
}

export interface CalendarDayItem {
    habitId: number
    habitName: string
    kind: 'habit' | 'milestone'
    milestoneId?: number
    milestoneTitle?: string
    baseXP: number
    done: boolean
}

function stripDate(d: Date): Date {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
}

function sameDay(a: Date, b: Date): boolean {
    return stripDate(a).getTime() === stripDate(b).getTime()
}

function daysBetween(a: Date, b: Date): number {
    return Math.round((stripDate(b).getTime() - stripDate(a).getTime()) / (86400000))
}

function getCheckInDatesForHabit(habitId: number, checkIns: CalendarCheckIn[]): Date[] {
    return checkIns
        .filter(c => c.habitId === habitId)
        .map(c => stripDate(new Date(c.completedAt)))
        .filter((d, i, arr) => arr.findIndex(x => x.getTime() === d.getTime()) === i)
        .sort((a, b) => a.getTime() - b.getTime())
}

function wasCheckedOn(habitId: number, date: Date, checkIns: CalendarCheckIn[], milestoneId?: number): boolean {
    return checkIns.some(c => {
        if (c.habitId !== habitId) return false
        if (!sameDay(new Date(c.completedAt), date)) return false
        if (milestoneId != null) return c.milestoneId === milestoneId
        return c.milestoneId == null
    })
}

function habitExistedOn(habit: Habit, date: Date): boolean {
    const created = stripDate(new Date(habit.createdAt))
    return date.getTime() >= created.getTime()
}

function isRecurringDueOnDate(
    habitType: string,
    targetDate: Date,
    checkInDates: Date[]
): boolean {
    const beforeTarget = checkInDates.filter(d => d.getTime() < targetDate.getTime())
    const lastCheck = beforeTarget.length ? beforeTarget[beforeTarget.length - 1] : null

    if (wasCheckedOnDate(checkInDates, targetDate)) return false

    switch (habitType) {
        case 'EveryOtherDay':
            if (!lastCheck) return true
            return daysBetween(lastCheck, targetDate) >= 2
        case 'Weekly':
            if (!lastCheck) return true
            return daysBetween(lastCheck, targetDate) >= 7
        default:
            return true
    }
}

function wasCheckedOnDate(checkInDates: Date[], targetDate: Date): boolean {
    return checkInDates.some(d => sameDay(d, targetDate))
}

function oneTimeItemsForDate(habit: Habit, targetDate: Date, checkIns: CalendarCheckIn[]): CalendarDayItem[] {
    const items: CalendarDayItem[] = []
    const milestones = habit.milestones || []
    const pending = milestones.filter(m => !m.isCompleted)

    if (pending.length > 0) {
        for (const m of pending) {
            if (sameDay(new Date(m.dueDate), targetDate)) {
                items.push({
                    habitId: habit.id,
                    habitName: habit.name,
                    kind: 'milestone',
                    milestoneId: m.id,
                    milestoneTitle: m.title,
                    baseXP: m.xpValue,
                    done: wasCheckedOn(habit.id, targetDate, checkIns, m.id),
                })
            }
        }
        return items
    }

    if (habit.dueDate && sameDay(new Date(habit.dueDate), targetDate)) {
        items.push({
            habitId: habit.id,
            habitName: habit.name,
            kind: 'habit',
            baseXP: habit.baseXP,
            done: wasCheckedOn(habit.id, targetDate, checkIns),
        })
    }
    return items
}

/** Returns check-in items due on a specific calendar date. */
export function getItemsForDate(
    habits: Habit[],
    targetDate: Date,
    checkIns: CalendarCheckIn[],
    today: Date = new Date()
): CalendarDayItem[] {
    const date = stripDate(targetDate)
    const todayD = stripDate(today)
    const items: CalendarDayItem[] = []

    for (const habit of habits) {
        if (!habit.isActive) continue
        if (!habitExistedOn(habit, date)) continue

        if (habit.isCompleted && date.getTime() > todayD.getTime()) continue

        if (habit.habitType === 'OneTime') {
            if (habit.isCompleted && date.getTime() > todayD.getTime()) continue
            items.push(...oneTimeItemsForDate(habit, date, checkIns))
            continue
        }

        if (habit.isCompleted) continue

        const checkInDates = getCheckInDatesForHabit(habit.id, checkIns)

        if (!isRecurringDueOnDate(habit.habitType || 'Daily', date, checkInDates)) continue

        const done = wasCheckedOn(habit.id, date, checkIns)

        if (sameDay(date, todayD) && habit.isCheckedToday) {
            items.push({
                habitId: habit.id,
                habitName: habit.name,
                kind: 'habit',
                baseXP: habit.baseXP,
                done: true,
            })
        } else {
            items.push({
                habitId: habit.id,
                habitName: habit.name,
                kind: 'habit',
                baseXP: habit.baseXP,
                done,
            })
        }
    }

    return items
}

export function buildMonthGrid(year: number, month: number): (Date | null)[][] {
    const first = new Date(year, month, 1)
    const last = new Date(year, month + 1, 0)
    const startPad = first.getDay()
    const days: (Date | null)[] = []

    for (let i = 0; i < startPad; i++) days.push(null)
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d))

    while (days.length % 7 !== 0) days.push(null)

    const weeks: (Date | null)[][] = []
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
    return weeks
}

export function formatMonthYear(year: number, month: number, locale: string): string {
    return new Date(year, month, 1).toLocaleDateString(locale, { year: 'numeric', month: 'long' })
}
