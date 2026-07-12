import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react'
import type { Habit } from '../utils/habitHelpers'
import {
    buildMonthGrid,
    formatMonthYear,
    getItemsForDate,
    type CalendarCheckIn,
    type CalendarDayItem,
} from '../utils/habitCalendarHelpers'
import { useTranslation } from '../stores/settingsStore'

interface HabitCalendarProps {
    habits: Habit[]
    checkIns: CalendarCheckIn[]
    isLoggedIn: boolean
}

const WEEKDAY_KEYS = ['cal.sun', 'cal.mon', 'cal.tue', 'cal.wed', 'cal.thu', 'cal.fri', 'cal.sat'] as const

function DayItemChip({ item }: { item: CalendarDayItem }) {
    const label = item.kind === 'milestone'
        ? `${item.habitName}: ${item.milestoneTitle}`
        : item.habitName

    return (
        <div className={`habit-cal-chip${item.done ? ' done' : ''}`} title={label}>
            <span className="habit-cal-chip-text">{label}</span>
            {item.done && <CheckCircle2 className="habit-cal-chip-check w-3 h-3" />}
        </div>
    )
}

export default function HabitCalendar({ habits, checkIns, isLoggedIn }: HabitCalendarProps) {
    const { t, language } = useTranslation()
    const today = useMemo(() => new Date(), [])
    const [viewYear, setViewYear] = useState(today.getFullYear())
    const [viewMonth, setViewMonth] = useState(today.getMonth())
    const [selectedDate, setSelectedDate] = useState<Date>(() => {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        return d
    })

    const locale = language === 'zh' ? 'zh-CN' : 'en-US'
    const weeks = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])

    const itemsByDateKey = useMemo(() => {
        const map = new Map<string, CalendarDayItem[]>()
        if (!isLoggedIn) return map

        for (let d = 1; d <= new Date(viewYear, viewMonth + 1, 0).getDate(); d++) {
            const date = new Date(viewYear, viewMonth, d)
            const key = date.toDateString()
            map.set(key, getItemsForDate(habits, date, checkIns, today))
        }
        return map
    }, [habits, checkIns, viewYear, viewMonth, isLoggedIn, today])

    const selectedItems = useMemo(
        () => getItemsForDate(habits, selectedDate, checkIns, today),
        [habits, checkIns, selectedDate, today]
    )

    const prevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
        else setViewMonth(m => m - 1)
    }

    const nextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
        else setViewMonth(m => m + 1)
    }

    if (!isLoggedIn) {
        return (
            <div className="habit-calendar-panel">
                <p className="habit-calendar-empty">{t('dash.loginToView')}</p>
            </div>
        )
    }

    if (!habits.length) {
        return (
            <div className="habit-calendar-panel">
                <p className="habit-calendar-empty">{t('dash.noHabits')}</p>
            </div>
        )
    }

    return (
        <div className="habit-calendar-wrap">
            <div className="habit-calendar-panel">
                <div className="habit-calendar-header">
                    <button type="button" className="habit-calendar-nav" onClick={prevMonth} aria-label="Previous month">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <h3 className="habit-calendar-month">{formatMonthYear(viewYear, viewMonth, locale)}</h3>
                    <button type="button" className="habit-calendar-nav" onClick={nextMonth} aria-label="Next month">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                <div className="habit-calendar-weekdays">
                    {WEEKDAY_KEYS.map(key => (
                        <span key={key} className="habit-calendar-weekday">{t(key)}</span>
                    ))}
                </div>

                <div className="habit-calendar-grid">
                    {weeks.flat().map((date, idx) => {
                        if (!date) {
                            return <div key={`empty-${idx}`} className="habit-calendar-cell empty" />
                        }

                        const key = date.toDateString()
                        const items = itemsByDateKey.get(key) ?? []
                        const isToday = date.toDateString() === today.toDateString()
                        const isSelected = date.toDateString() === selectedDate.toDateString()
                        const doneCount = items.filter(i => i.done).length
                        const pendingCount = items.length - doneCount

                        return (
                            <button
                                key={key}
                                type="button"
                                className={`habit-calendar-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${items.length ? ' has-items' : ''}`}
                                onClick={() => setSelectedDate(date)}
                            >
                                <span className="habit-calendar-day-num">{date.getDate()}</span>
                                {items.length > 0 && (
                                    <div className="habit-calendar-cell-items">
                                        {items.slice(0, 3).map(item => (
                                            <DayItemChip key={`${item.habitId}-${item.milestoneId ?? 'h'}`} item={item} />
                                        ))}
                                        {items.length > 3 && (
                                            <span className="habit-calendar-more">+{items.length - 3}</span>
                                        )}
                                    </div>
                                )}
                                {items.length > 0 && (
                                    <span className="habit-calendar-cell-stats">
                                        {doneCount > 0 && <span className="stat-done">{doneCount}✓</span>}
                                        {pendingCount > 0 && <span className="stat-pending">{pendingCount}</span>}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="habit-calendar-detail">
                <h4 className="habit-calendar-detail-title">
                    {selectedDate.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })}
                </h4>
                {selectedItems.length === 0 ? (
                    <p className="habit-calendar-detail-empty">{t('cal.noItems')}</p>
                ) : (
                    <ul className="habit-calendar-detail-list">
                        {selectedItems.map(item => {
                            const label = item.kind === 'milestone'
                                ? `${item.habitName} · ${item.milestoneTitle}`
                                : item.habitName
                            return (
                                <li
                                    key={`${item.habitId}-${item.milestoneId ?? 'h'}`}
                                    className={`habit-calendar-detail-item${item.done ? ' done' : ''}`}
                                >
                                    <span className="habit-calendar-detail-name">{label}</span>
                                    <span className="habit-calendar-detail-xp">+{item.baseXP} XP</span>
                                    {item.done && (
                                        <CheckCircle2 className="habit-calendar-detail-check w-5 h-5" />
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                )}
                {sameDay(selectedDate, today) && selectedItems.some(i => !i.done) && (
                    <a href="/habits" className="btn btn-primary habit-calendar-cta">{t('dash.goCheckin')}</a>
                )}
            </div>
        </div>
    )
}

function sameDay(a: Date, b: Date): boolean {
    return a.toDateString() === b.toDateString()
}
