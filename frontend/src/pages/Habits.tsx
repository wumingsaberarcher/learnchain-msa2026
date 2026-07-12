import { useEffect, useState, useMemo } from 'react'
import { useHabitStore } from '../stores/habitStore'
import { createCheckIn, getAllCheckIns } from '../api/checkInApi'
import { getAllHabits } from '../api/habitApi'
import CreateHabitWizard from '../components/CreateHabitWizard'
import type { CreateHabitPayload } from '../utils/habitHelpers'
import {
    difficultyKey,
    formatCountdownI18n,
    getDueMilestonesToday,
    getPendingMilestones,
    habitTypeKey,
    isDuplicateHabitName,
} from '../utils/habitHelpers'
import { useTranslation } from '../stores/languageStore'
import {
    Flame,
    Plus,
    Target,
    Pencil,
    Trash2,
    Check,
    History,
    Sparkles,
    Loader2,
    Flag,
} from 'lucide-react'

interface CheckIn {
    id: number
    habitId: number
    completedAt: string
    value?: number
    notes?: string
    xpEarned: number
    milestoneId?: number
}

export default function Habits() {
    const {
        habits,
        isLoading,
        error,
        fetchHabits,
        addHabit,
        updateHabit,
        deleteHabit,
        todayCheckedHabitIds,
        fetchTodayCheckedHabits,
        markHabitCheckedToday,
        isLoggedIn,
        currentUser,
        fetchCurrentUser,
    } = useHabitStore()

    const { t } = useTranslation()

    const [showForm, setShowForm] = useState(false)
    const [checkInLoading, setCheckInLoading] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState('')
    const [editingHabit, setEditingHabit] = useState<any>(null)

    const [showHistory, setShowHistory] = useState(false)
    const [historyCheckIns, setHistoryCheckIns] = useState<CheckIn[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [allHabitsForHistory, setAllHabitsForHistory] = useState<any[]>([])

    const historyHabitMap = useMemo(() => {
        const map = new Map<number, string>()
        habits.forEach(h => map.set(h.id, h.name))
        allHabitsForHistory.forEach(h => {
            if (!map.has(h.id)) map.set(h.id, h.name)
        })
        return map
    }, [habits, allHabitsForHistory])

    const todayCheckedCount = todayCheckedHabitIds.length
    const totalStreak = habits.reduce((sum, h) => sum + (h.currentStreak || 0), 0)
    const pendingToday = habits.filter(h => h.isDueToday && !h.isCheckedToday && !h.isCompleted).length

    useEffect(() => {
        if (isLoggedIn) {
            fetchHabits()
            fetchTodayCheckedHabits()
        }
    }, [fetchHabits, fetchTodayCheckedHabits, isLoggedIn])

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => setSuccessMessage(''), 2500)
            return () => clearTimeout(timer)
        }
    }, [successMessage])

    const handleCreateHabit = async (payload: CreateHabitPayload) => {
        try {
            await addHabit(payload)
            setSuccessMessage(t('habits.createSuccess'))
            await fetchHabits()
        } catch (err: any) {
            alert(err?.message || t('habits.nameDuplicate'))
            throw err
        }
    }

    const handleUpdateHabit = async () => {
        if (!editingHabit || !editingHabit.name.trim()) return
        const otherNames = habits.filter(h => h.id !== editingHabit.id).map(h => h.name)
        if (isDuplicateHabitName(editingHabit.name, otherNames)) {
            alert(t('habits.nameDuplicate'))
            return
        }
        try {
            await updateHabit(editingHabit.id, { name: editingHabit.name.trim() })
            setEditingHabit(null)
            setSuccessMessage(t('habits.updateSuccess'))
            await fetchHabits()
        } catch {
            alert('更新失败')
        }
    }

    const handleDeleteHabit = async (id: number, name: string) => {
        if (!confirm(`确定要删除「${name}」吗？\n\n注意：打卡历史会保留，你可以在下方的「历史痕迹」中查看过去贡献的经验值。`)) return
        try {
            await deleteHabit(id)
            setSuccessMessage(t('habits.deleteSuccess'))
        } catch {
            alert('删除失败')
        }
    }

    const handleCheckIn = async (habitId: number, milestoneId?: number) => {
        const key = milestoneId ? `${habitId}-${milestoneId}` : `${habitId}`
        setCheckInLoading(key)
        try {
            const result = await createCheckIn({ habitId, milestoneId })
            setSuccessMessage(`${t('habits.checkinSuccess')} +${result.xpEarned} XP`)
            if (result.newlyUnlocked?.length) {
                const { useAchievementStore } = await import('../stores/achievementStore')
                useAchievementStore.getState().handleNewUnlocks(result.newlyUnlocked)
            }
            await fetchCurrentUser()
            await fetchHabits()
            markHabitCheckedToday(habitId)
            await fetchTodayCheckedHabits()
        } catch (err: any) {
            alert(err?.message || '打卡失败，请重试')
        } finally {
            setCheckInLoading(null)
        }
    }

    const loadHistory = async () => {
        if (historyCheckIns.length > 0) return
        setHistoryLoading(true)
        try {
            const [checkinData, allHabitsData] = await Promise.all([
                getAllCheckIns(),
                getAllHabits(true),
            ])
            setHistoryCheckIns(checkinData.sort((a: CheckIn, b: CheckIn) =>
                new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
            ))
            setAllHabitsForHistory(allHabitsData)
        } catch {
            alert('加载历史失败，请确认已登录')
        } finally {
            setHistoryLoading(false)
        }
    }

    const toggleHistory = () => {
        const next = !showHistory
        setShowHistory(next)
        if (next) loadHistory()
    }

    const canCheckInMain = (habit: typeof habits[0]) => {
        if (habit.isCompleted) return false
        if (habit.habitType === 'OneTime') {
            const pending = getPendingMilestones(habit)
            if (pending.length > 0) return false
            return !habit.isCheckedToday
        }
        return habit.isDueToday && !habit.isCheckedToday
    }

    if (!isLoggedIn) {
        return (
            <div className="habits-page">
                <div className="habits-login-prompt">
                    <div className="habits-empty-icon">
                        <Target className="w-8 h-8" />
                    </div>
                    <h2>{t('habits.pleaseLogin')}</h2>
                    <p>{t('habits.loginHint')}</p>
                    <button type="button" className="btn btn-primary" onClick={() => alert(t('habits.loginAlert'))}>
                        {t('habits.goLogin')}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="habits-page">
            <div className="habits-page-header">
                <div>
                    <h1 className="habits-page-title">{t('habits.title')}</h1>
                    <p className="habits-page-subtitle">{t('habits.subtitle')}</p>
                </div>
                <button type="button" className="btn-habit-add" onClick={() => setShowForm(true)}>
                    <Plus className="w-4 h-4" /> {t('habits.new')}
                </button>
            </div>

            <div className="habits-stats-row">
                <div className="habits-stat-chip">
                    <span className="habits-stat-value">{habits.length}</span>
                    <span className="habits-stat-label">{t('habits.total')}</span>
                </div>
                <div className="habits-stat-chip">
                    <span className="habits-stat-value">{todayCheckedCount}</span>
                    <span className="habits-stat-label">{t('habits.checkedToday')}</span>
                </div>
                <div className="habits-stat-chip">
                    <span className="habits-stat-value">{pendingToday}</span>
                    <span className="habits-stat-label">{t('habits.pendingToday')}</span>
                </div>
                <div className="habits-stat-chip">
                    <span className="habits-stat-value">{totalStreak}</span>
                    <span className="habits-stat-label">{t('habits.totalStreak')}</span>
                </div>
                <div className="habits-stat-chip">
                    <span className="habits-stat-value">{currentUser?.totalXP || 0}</span>
                    <span className="habits-stat-label">{t('dash.totalXp')}</span>
                </div>
            </div>

            {successMessage && (
                <div className="habits-toast">
                    <Sparkles className="w-4 h-4 flex-shrink-0" />
                    {successMessage}
                </div>
            )}

            {showForm && (
                <CreateHabitWizard
                    onClose={() => setShowForm(false)}
                    onSubmit={handleCreateHabit}
                    existingNames={habits.map(h => h.name)}
                />
            )}

            {isLoading ? (
                <div className="habits-loading"><Loader2 className="w-6 h-6 animate-spin inline-block mr-2" />{t('habits.loading')}</div>
            ) : error ? (
                <div className="habits-error">{error}</div>
            ) : habits.length === 0 ? (
                <div className="habits-empty">
                    <div className="habits-empty-icon"><Target className="w-8 h-8" /></div>
                    <h2>{t('habits.empty')}</h2>
                    <p>{t('habits.emptyHint')}</p>
                    <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>{t('habits.createFirst')}</button>
                </div>
            ) : (
                <div className="habits-list">
                    {habits.map(habit => {
                        const isChecked = habit.isCheckedToday
                        const isChecking = checkInLoading === `${habit.id}`
                        const isEditing = editingHabit?.id === habit.id
                        const pendingMilestones = getPendingMilestones(habit)
                        const dueMilestones = getDueMilestonesToday(habit)
                        const showMainCheckIn = canCheckInMain(habit)

                        return (
                            <div key={habit.id} className={`habit-card${isChecked ? ' checked' : ''}${habit.isCompleted ? ' checked' : ''}`}>
                                <div className="habit-card-info">
                                    {!isEditing && (
                                        <div className="habit-card-avatar"><Target className="w-6 h-6" /></div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        {isEditing ? (
                                            <div className="habit-edit-row">
                                                <input
                                                    type="text"
                                                    value={editingHabit.name}
                                                    onChange={e => setEditingHabit({ ...editingHabit, name: e.target.value })}
                                                    className="habit-edit-input"
                                                />
                                                <button type="button" className="btn-habit btn-habit-checkin" onClick={handleUpdateHabit}>{t('habits.save')}</button>
                                                <button type="button" className="btn-habit btn-habit-ghost" onClick={() => setEditingHabit(null)}>{t('auth.cancel')}</button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="habit-card-name">{habit.name}</div>
                                                <div className="habit-card-meta">
                                                    <span className="habit-badge habit-badge-freq">{t(habitTypeKey(habit.habitType || 'Daily'))}</span>
                                                    <span className="habit-badge habit-badge-difficulty">{t(difficultyKey(habit.difficulty || 1))}</span>
                                                    <span className="habit-badge habit-badge-xp">+{habit.baseXP} XP</span>
                                                    {habit.habitType === 'OneTime' && (
                                                        <span className="habit-badge habit-badge-onetime">{t('habits.oneTime')}</span>
                                                    )}
                                                    {habit.currentStreak > 0 && (
                                                        <span className="habit-badge habit-badge-streak">
                                                            <Flame className="w-3 h-3" /> {habit.currentStreak} {t('dash.streakDays')}
                                                        </span>
                                                    )}
                                                    {habit.isCompleted && (
                                                        <span className="habit-badge habit-badge-xp"><Check className="w-3 h-3 inline" /> {t('habits.completed')}</span>
                                                    )}
                                                </div>
                                                {habit.habitType === 'OneTime' && habit.dueDate && !habit.isCompleted && (
                                                    <div className="habit-countdown">
                                                        <Flag className="w-3.5 h-3.5 inline mr-1" />
                                                        {formatCountdownI18n(habit.dueDate, t)}
                                                    </div>
                                                )}
                                                {pendingMilestones.length > 0 && (
                                                    <div className="habit-milestones-panel">
                                                        {pendingMilestones.map(m => {
                                                            const msKey = `${habit.id}-${m.id}`
                                                            const isMsChecking = checkInLoading === msKey
                                                            const isDue = new Date(m.dueDate) <= new Date()
                                                            return (
                                                                <div key={m.id} className={`habit-milestone-item${m.isCompleted ? ' done' : ''}`}>
                                                                    <div className="habit-milestone-item-info">
                                                                        <div className="habit-milestone-item-title">{m.title}</div>
                                                                        <div className="habit-milestone-item-date">
                                                                            {m.dueDate} · +{m.xpValue} XP
                                                                            {!isDue && ` · ${t('habits.notDueYet')}`}
                                                                        </div>
                                                                    </div>
                                                                    {!m.isCompleted && (
                                                                        <button
                                                                            type="button"
                                                                            disabled={!isDue || isMsChecking}
                                                                            className="btn-habit btn-habit-checkin btn-habit-milestone"
                                                                            onClick={() => handleCheckIn(habit.id, m.id)}
                                                                        >
                                                                            {isMsChecking ? t('habits.checking') : t('habits.milestoneCheckin')}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                {!isEditing && (
                                    <div className="habit-card-actions">
                                        {showMainCheckIn && (
                                            <button
                                                type="button"
                                                onClick={() => handleCheckIn(habit.id)}
                                                disabled={isChecking}
                                                className={`btn-habit btn-habit-checkin${isChecking ? ' loading' : ''}`}
                                            >
                                                {isChecking ? (
                                                    <><Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" />{t('habits.checking')}</>
                                                ) : habit.habitType === 'OneTime' ? t('habits.finalCheckin') : t('habits.checkin')}
                                            </button>
                                        )}
                                        {!showMainCheckIn && isChecked && !habit.isCompleted && habit.habitType !== 'OneTime' && (
                                            <button type="button" disabled className="btn-habit btn-habit-checkin done">
                                                <Check className="w-3.5 h-3.5 inline mr-1" />{t('habits.checked')}
                                            </button>
                                        )}
                                        {!showMainCheckIn && !isChecked && !habit.isDueToday && !habit.isCompleted && dueMilestones.length === 0 && pendingMilestones.length === 0 && (
                                            <button type="button" disabled className="btn-habit btn-habit-ghost">
                                                {t('habits.noNeedToday')}
                                            </button>
                                        )}
                                        {habit.isCompleted && (
                                            <button type="button" disabled className="btn-habit btn-habit-checkin done">
                                                <Check className="w-3.5 h-3.5 inline mr-1" />{t('habits.completed')}
                                            </button>
                                        )}
                                        <button type="button" className="btn-habit btn-habit-ghost" onClick={() => setEditingHabit(habit)}>
                                            <Pencil className="w-3.5 h-3.5 inline mr-1" />{t('habits.edit')}
                                        </button>
                                        <button type="button" className="btn-habit btn-habit-danger" onClick={() => handleDeleteHabit(habit.id, habit.name)}>
                                            <Trash2 className="w-3.5 h-3.5 inline mr-1" />{t('habits.delete')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            <div className="habits-section-divider">
                <button type="button" className="habits-history-toggle" onClick={toggleHistory}>
                    <History className="w-4 h-4" />
                    {showHistory ? t('habits.historyHide') : t('habits.historyShow')} {t('habits.history')}
                    <span className="toggle-hint">{t('habits.historyHint')}</span>
                </button>

                {showHistory && (
                    <div className="habits-history-panel">
                        <div className="habits-history-header">
                            <div>
                                <div className="habits-history-title">{t('habits.historyTitle')}</div>
                                <div className="habits-history-subtitle">{t('habits.historySub')}</div>
                            </div>
                            <div className="habits-history-xp">
                                <strong>{currentUser?.totalXP || 0} XP</strong><br />{t('habits.currentXp')}
                            </div>
                        </div>

                        {historyLoading ? (
                            <div className="habits-loading"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />{t('habits.historyLoading')}</div>
                        ) : historyCheckIns.length === 0 ? (
                            <div className="habits-loading">{t('habits.noHistory')}</div>
                        ) : (
                            <div className="habits-history-list">
                                {historyCheckIns.map(checkin => {
                                    const habitName = historyHabitMap.get(checkin.habitId) || `${t('habits.deletedHabit')} #${checkin.habitId}`
                                    return (
                                        <div key={checkin.id} className="habits-history-item">
                                            <div>
                                                <div className="habits-history-item-name">{habitName}</div>
                                                <div className="habits-history-item-date">
                                                    {new Date(checkin.completedAt).toLocaleDateString('zh-CN', {
                                                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                                    })}
                                                    {checkin.notes && ` · ${checkin.notes}`}
                                                </div>
                                            </div>
                                            <div className="habits-history-item-xp">+{checkin.xpEarned} XP</div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        <p className="habits-history-footer">{t('habits.historyFooter')}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
