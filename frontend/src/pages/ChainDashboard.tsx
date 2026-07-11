import { useEffect, useMemo } from 'react'
import { useHabitStore } from '../stores/habitStore'
import { Target, ArrowRight, CheckCircle2, Clock, Sparkles } from 'lucide-react'
import {
    getDifficultyLabel,
    getHabitTypeLabel,
    getDueMilestonesToday,
} from '../utils/habitHelpers'

export default function ChainDashboard() {
    const {
        habits,
        fetchHabits,
        fetchTodayCheckedHabits,
        currentUser,
        isLoggedIn,
        todayCheckedHabitIds,
    } = useHabitStore()

    useEffect(() => {
        if (isLoggedIn) {
            fetchHabits()
            fetchTodayCheckedHabits()
        }
    }, [fetchHabits, fetchTodayCheckedHabits, isLoggedIn])

    const dueTodayHabits = useMemo(
        () => habits.filter(h => h.isDueToday && !h.isCompleted),
        [habits]
    )

    const uncheckedHabits = useMemo(
        () => dueTodayHabits.filter(h => !h.isCheckedToday),
        [dueTodayHabits]
    )

    const checkedTodayHabits = useMemo(
        () => habits.filter(h => todayCheckedHabitIds.includes(h.id)),
        [habits, todayCheckedHabitIds]
    )

    const todayCheckedCount = checkedTodayHabits.length
    const todayPendingCount = uncheckedHabits.length
    const totalHabits = habits.length
    const totalStreak = habits.reduce((sum, h) => sum + (h.currentStreak || 0), 0)

    return (
        <div className="min-h-screen text-white">
            <section id="home" className="hero">
                <div className="hero-content">
                    <h1>LearnChain</h1>
                    <p>Where Persistence Meets Growth</p>

                    <div className="hero-stats">
                        <div className="stat">
                            <span className="stat-number">{totalHabits}</span>
                            <span className="stat-label">我的习惯</span>
                        </div>
                        <div className="stat">
                            <span className="stat-number">{totalStreak}</span>
                            <span className="stat-label">当前连击</span>
                        </div>
                        <div className="stat">
                            <span className="stat-number">{currentUser?.totalXP || 0}</span>
                            <span className="stat-label">总经验值</span>
                        </div>
                        <div className="stat">
                            <span className="stat-number">{todayCheckedCount}</span>
                            <span className="stat-label">今日打卡</span>
                        </div>
                    </div>

                    <div className="cta-buttons">
                        <a href="/habits" className="btn btn-primary">去打卡</a>
                        <a href="#habits" className="btn btn-secondary">查看习惯</a>
                    </div>
                </div>
            </section>

            <section id="about" className="section">
                <h2>关于 LearnChain</h2>
                <div className="about-content">
                    <div className="about-text">
                        <p>LearnChain 是一个帮助你建立长期习惯的 gamified 平台。通过打卡、连击、经验值和等级系统，让坚持变得有成就感。</p>
                        <p>支持每日、每周、一次性等多种习惯类型，还能拆分小目标，按难易程度获得不同经验值。</p>
                    </div>
                    <div className="about-visual">
                        <div className="blockchain-visual">
                            <div className="block">打卡</div>
                            <div className="block">连击</div>
                            <div className="block">XP</div>
                            <div className="block">等级</div>
                            <div className="block">成就</div>
                        </div>
                    </div>
                </div>
            </section>

            <section id="habits" className="section">
                <h2>我的习惯</h2>
                <div className="speakers-grid">
                    {habits.length > 0 ? (
                        habits.slice(0, 6).map((habit) => (
                            <div key={habit.id} className="speaker-card">
                                <div className="speaker-avatar">
                                    <Target className="w-10 h-10" />
                                </div>
                                <h3 className="speaker-name">{habit.name}</h3>
                                <div className="speaker-title">
                                    +{habit.baseXP} XP · {getHabitTypeLabel(habit.habitType || 'Daily')}
                                </div>
                                <p className="speaker-bio">
                                    {getDifficultyLabel(habit.difficulty || 1)}难度
                                    {habit.currentStreak > 0 && ` · ${habit.currentStreak} 天连击`}
                                </p>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full text-center py-12 text-zinc-400">
                            你还没有创建习惯，快去新建一个吧！
                        </div>
                    )}
                </div>
            </section>

            <section id="checkin" className="section">
                <h2>今日打卡记录</h2>
                {!isLoggedIn ? (
                    <div className="today-checkin-panel">
                        <div className="today-checkin-empty">登录后即可查看今日打卡进度</div>
                    </div>
                ) : (
                    <div className="today-checkin-panel">
                        <div className="today-checkin-stats">
                            <div className="today-checkin-stat done">
                                <span className="today-checkin-number">{todayCheckedCount}</span>
                                <span className="today-checkin-label">已打卡</span>
                            </div>
                            <div className="today-checkin-stat pending">
                                <span className="today-checkin-number">{todayPendingCount}</span>
                                <span className="today-checkin-label">待打卡</span>
                            </div>
                        </div>

                        {todayPendingCount > 0 ? (
                            <>
                                <div className="today-checkin-section-title">
                                    <Clock className="w-4 h-4" />
                                    待打卡习惯
                                </div>
                                <div className="today-checkin-list">
                                    {uncheckedHabits.map(habit => {
                                        const dueMilestones = getDueMilestonesToday(habit)
                                        return (
                                            <div key={habit.id} className="today-checkin-item">
                                                <div>
                                                    <div className="today-checkin-item-name">{habit.name}</div>
                                                    <div className="today-checkin-item-meta">
                                                        {getHabitTypeLabel(habit.habitType || 'Daily')}
                                                        {' · '}{getDifficultyLabel(habit.difficulty || 1)}
                                                        {' · '}+{habit.baseXP} XP
                                                        {dueMilestones.length > 0 && ` · ${dueMilestones.length} 个小目标待完成`}
                                                    </div>
                                                </div>
                                                <a href="/habits" className="btn-habit btn-habit-checkin" style={{ textDecoration: 'none' }}>
                                                    去打卡
                                                </a>
                                            </div>
                                        )
                                    })}
                                </div>
                            </>
                        ) : dueTodayHabits.length === 0 ? (
                            <div className="today-checkin-empty">
                                今天没有需要打卡的习惯，好好休息一下吧
                            </div>
                        ) : (
                            <div className="today-checkin-all-done">
                                <Sparkles className="w-5 h-5 inline mr-1" />
                                太棒了！今日所有待打卡任务已完成
                            </div>
                        )}

                        {checkedTodayHabits.length > 0 && (
                            <>
                                <div className="today-checkin-section-title" style={{ marginTop: '1.5rem' }}>
                                    <CheckCircle2 className="w-4 h-4" />
                                    今日已完成（{checkedTodayHabits.length}）
                                </div>
                                <div className="today-checkin-list">
                                    {checkedTodayHabits.map(habit => (
                                        <div key={habit.id} className="today-checkin-item" style={{ opacity: 0.75 }}>
                                            <div>
                                                <div className="today-checkin-item-name">{habit.name}</div>
                                                <div className="today-checkin-item-meta">
                                                    {getHabitTypeLabel(habit.habitType || 'Daily')} · 已完成
                                                </div>
                                            </div>
                                            <span className="habit-badge habit-badge-xp">✓</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </section>

            <section className="section">
                <div className="register-section">
                    <div className="register-content">
                        <h2 className="register-title">坚持就是胜利</h2>
                        <p className="register-subtitle">每一次打卡，都是在为更好的自己投资。</p>
                        <a href="/habits" className="btn btn-primary inline-block mt-4">
                            去打卡 <ArrowRight className="inline w-5 h-5 ml-2" />
                        </a>
                    </div>
                </div>
            </section>
        </div>
    )
}
