import { useEffect, useMemo } from 'react'
import { useHabitStore } from '../stores/habitStore'
import { useTranslation } from '../stores/languageStore'
import { Target, ArrowRight, CheckCircle2, Clock, Sparkles } from 'lucide-react'
import { difficultyKey, habitTypeKey } from '../utils/habitHelpers'
import MotivationTicker from '../components/MotivationTicker'

export default function ChainDashboard() {
    const { t } = useTranslation()
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
        <div className="min-h-screen">
            <section id="home" className="hero">
                <div className="hero-content">
                    <h1>LearnChain</h1>
                    <p>{t('dash.tagline')}</p>

                    <div className="hero-stats">
                        <div className="stat">
                            <span className="stat-number">{totalHabits}</span>
                            <span className="stat-label">{t('dash.myHabits')}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-number">{totalStreak}</span>
                            <span className="stat-label">{t('dash.streak')}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-number">{currentUser?.totalXP || 0}</span>
                            <span className="stat-label">{t('dash.totalXp')}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-number">{todayCheckedCount}</span>
                            <span className="stat-label">{t('dash.todayCheckin')}</span>
                        </div>
                    </div>

                    <div className="cta-buttons">
                        <a href="/habits" className="btn btn-primary">{t('dash.goCheckin')}</a>
                        <a href="#habits" className="btn btn-secondary">{t('dash.viewHabits')}</a>
                    </div>
                </div>
            </section>

            <section id="about" className="section">
                <h2>{t('dash.about')}</h2>
                <div className="about-content">
                    <div className="about-text">
                        <p>{t('dash.aboutP1')}</p>
                        <p>{t('dash.aboutP2')}</p>
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
                <h2>{t('dash.habitSection')}</h2>
                <div className="speakers-grid">
                    {habits.length > 0 ? (
                        habits.slice(0, 6).map((habit) => (
                            <div key={habit.id} className="speaker-card">
                                <div className="speaker-avatar">
                                    <Target className="w-10 h-10" />
                                </div>
                                <h3 className="speaker-name">{habit.name}</h3>
                                <div className="speaker-title">
                                    +{habit.baseXP} XP · {t(habitTypeKey(habit.habitType || 'Daily'))}
                                </div>
                                <p className="speaker-bio">
                                    {t(difficultyKey(habit.difficulty || 1))} {t('dash.difficulty')}
                                    {habit.currentStreak > 0 && ` · ${habit.currentStreak} ${t('dash.streakDays')}`}
                                </p>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full text-center py-12 text-zinc-400">
                            {t('dash.noHabits')}
                        </div>
                    )}
                </div>
            </section>

            <section id="checkin" className="section">
                <h2>{t('dash.todayRecord')}</h2>
                {!isLoggedIn ? (
                    <div className="today-checkin-panel">
                        <div className="today-checkin-empty">{t('dash.loginToView')}</div>
                    </div>
                ) : (
                    <div className="today-checkin-panel">
                        <div className="today-checkin-stats">
                            <div className="today-checkin-stat done">
                                <span className="today-checkin-number">{todayCheckedCount}</span>
                                <span className="today-checkin-label">{t('dash.checked')}</span>
                            </div>
                            <div className="today-checkin-stat pending">
                                <span className="today-checkin-number">{todayPendingCount}</span>
                                <span className="today-checkin-label">{t('dash.pending')}</span>
                            </div>
                        </div>

                        {todayPendingCount > 0 ? (
                            <>
                                <div className="today-checkin-section-title">
                                    <Clock className="w-4 h-4" />
                                    {t('dash.pendingList')}
                                </div>
                                <div className="today-checkin-list">
                                    {uncheckedHabits.map(habit => (
                                            <div key={habit.id} className="today-checkin-item">
                                                <div>
                                                    <div className="today-checkin-item-name">{habit.name}</div>
                                                    <div className="today-checkin-item-meta">
                                                        {t(habitTypeKey(habit.habitType || 'Daily'))}
                                                        {' · '}{t(difficultyKey(habit.difficulty || 1))}
                                                        {' · '}+{habit.baseXP} XP
                                                    </div>
                                                </div>
                                                <a href="/habits" className="btn-habit btn-habit-checkin" style={{ textDecoration: 'none' }}>
                                                    {t('dash.goCheckin')}
                                                </a>
                                            </div>
                                        ))}
                                </div>
                            </>
                        ) : dueTodayHabits.length === 0 ? (
                            <div className="today-checkin-empty">{t('dash.noDueToday')}</div>
                        ) : (
                            <div className="today-checkin-all-done">
                                <Sparkles className="w-5 h-5 inline mr-1" />
                                {t('dash.allDone')}
                            </div>
                        )}

                        {checkedTodayHabits.length > 0 && (
                            <>
                                <div className="today-checkin-section-title" style={{ marginTop: '1.5rem' }}>
                                    <CheckCircle2 className="w-4 h-4" />
                                    {t('dash.completedToday')}（{checkedTodayHabits.length}）
                                </div>
                                <div className="today-checkin-list">
                                    {checkedTodayHabits.map(habit => (
                                        <div key={habit.id} className="today-checkin-item" style={{ opacity: 0.75 }}>
                                            <div>
                                                <div className="today-checkin-item-name">{habit.name}</div>
                                                <div className="today-checkin-item-meta">
                                                    {t(habitTypeKey(habit.habitType || 'Daily'))} · {t('dash.done')}
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
                        <h2 className="register-title">{t('dash.persist')}</h2>
                        <MotivationTicker fallback={t('dash.persistSub')} />
                        <a href="/habits" className="btn btn-primary inline-block mt-4">
                            {t('dash.goCheckin')} <ArrowRight className="inline w-5 h-5 ml-2" />
                        </a>
                    </div>
                </div>
            </section>
        </div>
    )
}
