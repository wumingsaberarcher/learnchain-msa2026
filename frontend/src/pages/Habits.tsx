import { useEffect, useState, useMemo } from 'react'
import { useHabitStore } from '../stores/habitStore'
import { createCheckIn, getAllCheckIns } from '../api/checkInApi'
import { getAllHabits } from '../api/habitApi'
import CreateHabitWizard from '../components/CreateHabitWizard'
import type { CreateHabitPayload } from '../utils/habitHelpers'
import {
    formatCountdown,
    getDifficultyLabel,
    getDueMilestonesToday,
    getHabitTypeLabel,
    getPendingMilestones,
} from '../utils/habitHelpers'
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
        await addHabit(payload)
        setSuccessMessage('习惯创建成功！')
        await fetchHabits()
    }

    const handleUpdateHabit = async () => {
        if (!editingHabit || !editingHabit.name.trim()) return
        try {
            await updateHabit(editingHabit.id, { name: editingHabit.name.trim() })
            setEditingHabit(null)
            setSuccessMessage('习惯更新成功！')
            await fetchHabits()
        } catch {
            alert('更新失败')
        }
    }

    const handleDeleteHabit = async (id: number, name: string) => {
        if (!confirm(`确定要删除「${name}」吗？\n\n注意：打卡历史会保留，你可以在下方的「历史痕迹」中查看过去贡献的经验值。`)) return
        try {
            await deleteHabit(id)
            setSuccessMessage('习惯已删除，历史记录已保留')
        } catch {
            alert('删除失败')
        }
    }

    const handleCheckIn = async (habitId: number, milestoneId?: number) => {
        const key = milestoneId ? `${habitId}-${milestoneId}` : `${habitId}`
        setCheckInLoading(key)
        try {
            const result = await createCheckIn({ habitId, milestoneId })
            setSuccessMessage(`打卡成功！+${result.xpEarned} XP`)
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
                    <h2>请先登录</h2>
                    <p>登录后即可创建习惯、打卡积累 XP，开启你的成长链。</p>
                    <button type="button" className="btn btn-primary" onClick={() => alert('请点击右上角「登录」按钮')}>
                        去登录
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="habits-page">
            <div className="habits-page-header">
                <div>
                    <h1 className="habits-page-title">我的习惯</h1>
                    <p className="habits-page-subtitle">坚持打卡，积累连击与经验值</p>
                </div>
                <button type="button" className="btn-habit-add" onClick={() => setShowForm(true)}>
                    <Plus className="w-4 h-4" /> 新建习惯
                </button>
            </div>

            <div className="habits-stats-row">
                <div className="habits-stat-chip">
                    <span className="habits-stat-value">{habits.length}</span>
                    <span className="habits-stat-label">习惯总数</span>
                </div>
                <div className="habits-stat-chip">
                    <span className="habits-stat-value">{todayCheckedCount}</span>
                    <span className="habits-stat-label">今日已打卡</span>
                </div>
                <div className="habits-stat-chip">
                    <span className="habits-stat-value">{pendingToday}</span>
                    <span className="habits-stat-label">今日待打卡</span>
                </div>
                <div className="habits-stat-chip">
                    <span className="habits-stat-value">{totalStreak}</span>
                    <span className="habits-stat-label">累计连击天数</span>
                </div>
                <div className="habits-stat-chip">
                    <span className="habits-stat-value">{currentUser?.totalXP || 0}</span>
                    <span className="habits-stat-label">总经验值</span>
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
                />
            )}

            {isLoading ? (
                <div className="habits-loading"><Loader2 className="w-6 h-6 animate-spin inline-block mr-2" />加载中...</div>
            ) : error ? (
                <div className="habits-error">{error}</div>
            ) : habits.length === 0 ? (
                <div className="habits-empty">
                    <div className="habits-empty-icon"><Target className="w-8 h-8" /></div>
                    <h2>还没有习惯</h2>
                    <p>创建你的第一个习惯，支持每日、每周或一次性目标。</p>
                    <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>立即创建第一个习惯</button>
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
                                                <button type="button" className="btn-habit btn-habit-checkin" onClick={handleUpdateHabit}>保存</button>
                                                <button type="button" className="btn-habit btn-habit-ghost" onClick={() => setEditingHabit(null)}>取消</button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="habit-card-name">{habit.name}</div>
                                                <div className="habit-card-meta">
                                                    <span className="habit-badge habit-badge-freq">{getHabitTypeLabel(habit.habitType || 'Daily')}</span>
                                                    <span className="habit-badge habit-badge-difficulty">{getDifficultyLabel(habit.difficulty || 1)}</span>
                                                    <span className="habit-badge habit-badge-xp">+{habit.baseXP} XP</span>
                                                    {habit.habitType === 'OneTime' && (
                                                        <span className="habit-badge habit-badge-onetime">一次性</span>
                                                    )}
                                                    {habit.currentStreak > 0 && (
                                                        <span className="habit-badge habit-badge-streak">
                                                            <Flame className="w-3 h-3" /> {habit.currentStreak} 天连击
                                                        </span>
                                                    )}
                                                    {habit.isCompleted && (
                                                        <span className="habit-badge habit-badge-xp"><Check className="w-3 h-3 inline" /> 已完成</span>
                                                    )}
                                                </div>
                                                {habit.habitType === 'OneTime' && habit.dueDate && !habit.isCompleted && (
                                                    <div className="habit-countdown">
                                                        <Flag className="w-3.5 h-3.5 inline mr-1" />
                                                        {formatCountdown(habit.dueDate)}
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
                                                                            {!isDue && ' · 未到日期'}
                                                                        </div>
                                                                    </div>
                                                                    {!m.isCompleted && (
                                                                        <button
                                                                            type="button"
                                                                            disabled={!isDue || isMsChecking}
                                                                            className="btn-habit btn-habit-checkin btn-habit-milestone"
                                                                            onClick={() => handleCheckIn(habit.id, m.id)}
                                                                        >
                                                                            {isMsChecking ? '打卡中' : '小目标打卡'}
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
                                                    <><Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" />打卡中</>
                                                ) : habit.habitType === 'OneTime' ? '最终打卡' : '打卡'}
                                            </button>
                                        )}
                                        {!showMainCheckIn && isChecked && !habit.isCompleted && habit.habitType !== 'OneTime' && (
                                            <button type="button" disabled className="btn-habit btn-habit-checkin done">
                                                <Check className="w-3.5 h-3.5 inline mr-1" />今日已打卡
                                            </button>
                                        )}
                                        {!showMainCheckIn && !isChecked && !habit.isDueToday && !habit.isCompleted && dueMilestones.length === 0 && pendingMilestones.length === 0 && (
                                            <button type="button" disabled className="btn-habit btn-habit-ghost">
                                                今日无需打卡
                                            </button>
                                        )}
                                        {habit.isCompleted && (
                                            <button type="button" disabled className="btn-habit btn-habit-checkin done">
                                                <Check className="w-3.5 h-3.5 inline mr-1" />任务完成
                                            </button>
                                        )}
                                        <button type="button" className="btn-habit btn-habit-ghost" onClick={() => setEditingHabit(habit)}>
                                            <Pencil className="w-3.5 h-3.5 inline mr-1" />编辑
                                        </button>
                                        <button type="button" className="btn-habit btn-habit-danger" onClick={() => handleDeleteHabit(habit.id, habit.name)}>
                                            <Trash2 className="w-3.5 h-3.5 inline mr-1" />删除
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
                    {showHistory ? '隐藏' : '查看'} 我的打卡历史痕迹
                    <span className="toggle-hint">保留所有记录，即使习惯已删除</span>
                </button>

                {showHistory && (
                    <div className="habits-history-panel">
                        <div className="habits-history-header">
                            <div>
                                <div className="habits-history-title">打卡历史痕迹</div>
                                <div className="habits-history-subtitle">这里记录了你所有过去的努力和经验值来源</div>
                            </div>
                            <div className="habits-history-xp">
                                <strong>{currentUser?.totalXP || 0} XP</strong><br />当前总经验值
                            </div>
                        </div>

                        {historyLoading ? (
                            <div className="habits-loading"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />加载历史中...</div>
                        ) : historyCheckIns.length === 0 ? (
                            <div className="habits-loading">还没有任何打卡记录</div>
                        ) : (
                            <div className="habits-history-list">
                                {historyCheckIns.map(checkin => {
                                    const habitName = historyHabitMap.get(checkin.habitId) || `已删除习惯 #${checkin.habitId}`
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
                        <p className="habits-history-footer">删除习惯不会丢失历史记录，你可以随时在这里回顾自己的坚持。</p>
                    </div>
                )}
            </div>
        </div>
    )
}
