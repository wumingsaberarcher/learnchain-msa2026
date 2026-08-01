import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Target } from 'lucide-react'
import Dashboard from './pages/ChainDashboard'
import About from './pages/About'
import Music from './pages/Music'
import Habits from './pages/Habits'
import Profile from './pages/Profile'
import Achievements from './pages/Achievements'
import Admin from './pages/Admin'
import LoginModal from './components/LoginModal'
import BackgroundAnimation from './components/BackgroundAnimation'
import ThemeLocaleToggle from './components/ThemeLocaleToggle'
import UserProfileMenu from './components/UserProfileMenu'
import BadgeUnlockModal from './components/BadgeUnlockModal'
import AiAssistant from './components/ai/AiAssistant'
import IdleRestOverlay from './components/IdleRestOverlay'
import FocusModeOverlay from './components/FocusModeOverlay'
import AppSidebar from './components/AppSidebar'
import BgmPlayer from './components/BgmPlayer'
import { useHabitStore } from './stores/habitStore'
import { useAchievementStore } from './stores/achievementStore'
import { useIdleRestStore } from './stores/idleRestStore'
import { useFocusModeStore } from './stores/focusModeStore'
import { useBgmStore } from './stores/bgmStore'
import { useTranslation } from './stores/settingsStore'
import { isStaffRole } from './api/adminApi'

function App() {
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
    const { isLoggedIn, currentUser, fetchHabits, fetchTodayCheckedHabits, fetchCurrentUser, markHabitCheckedToday } = useHabitStore()
    const { fetchProfile, syncAchievements, handleNewUnlocks } = useAchievementStore()
    const { t, theme } = useTranslation()
    const isResting = useIdleRestStore(s => s.isResting)
    const isFocusing = useFocusModeStore(s => s.isActive)
    const toggleSidebar = useBgmStore(s => s.toggleSidebar)

    useEffect(() => {
        if (isLoggedIn) {
            fetchProfile().then(() => syncAchievements())
        }
    }, [isLoggedIn, fetchProfile, syncAchievements])

    return (
        <BrowserRouter>
            <div className={`app-shell min-h-screen theme-${theme}`}>
                <BackgroundAnimation />
                <BgmPlayer />
                <AppSidebar />

                <header>
                    <nav>
                        <div className="logo logo-cluster">
                            <button
                                type="button"
                                className="logo-icon-btn"
                                onClick={toggleSidebar}
                                aria-label={t('sidebar.open')}
                                title={t('sidebar.open')}
                            >
                                <Target className="w-6 h-6" />
                            </button>
                            <NavLink to="/" className="logo-home-link">
                                <span className="logo-text">LearnChain</span>
                            </NavLink>
                        </div>

                        <div className="nav-right">
                            <ul className="nav-links">
                                <li>
                                    <NavLink
                                        to="/"
                                        className={({ isActive }) => (isActive ? 'active' : undefined)}
                                    >
                                        {t('nav.dashboard')}
                                    </NavLink>
                                </li>
                                <li>
                                    <NavLink
                                        to="/habits"
                                        className={({ isActive }) => (isActive ? 'active' : undefined)}
                                    >
                                        {t('nav.habits')}
                                    </NavLink>
                                </li>
                                {isLoggedIn && isStaffRole(currentUser?.role) && (
                                    <li>
                                        <NavLink
                                            to="/admin"
                                            className={({ isActive }) => (isActive ? 'active' : undefined)}
                                        >
                                            {t('nav.admin')}
                                        </NavLink>
                                    </li>
                                )}
                            </ul>

                            <div className="nav-auth">
                                {isLoggedIn && currentUser ? (
                                    <UserProfileMenu />
                                ) : (
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-nav-login"
                                        onClick={() => setIsLoginModalOpen(true)}
                                    >
                                        {t('nav.login')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </nav>
                </header>

                <main className="app-main">
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/habits" element={<Habits />} />
                        <Route path="/music" element={<Music />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/achievements" element={<Achievements />} />
                        <Route path="/admin" element={<Admin />} />
                    </Routes>
                </main>

                <BadgeUnlockModal />
                {!isResting && !isFocusing && (
                    <div className="theme-locale-fab">
                        <ThemeLocaleToggle />
                    </div>
                )}
                {!isResting && !isFocusing && <AiAssistant />}
                <IdleRestOverlay pauseIdle={isLoginModalOpen || isFocusing} />
                <FocusModeOverlay
                    onCompleted={async (result) => {
                        const bonus = result.focusBonusXp ?? 0
                        const msg = bonus > 0
                            ? t('focus.successBonus', { total: result.xpEarned, bonus })
                            : t('focus.success', { total: result.xpEarned })
                        window.dispatchEvent(new CustomEvent('learnchain:toast', { detail: msg }))
                        if (result.newlyUnlocked?.length) {
                            handleNewUnlocks(result.newlyUnlocked)
                        }
                        markHabitCheckedToday(result.habitId)
                        await fetchCurrentUser()
                        await fetchHabits()
                        await fetchTodayCheckedHabits()
                    }}
                />

                <LoginModal
                    isOpen={isLoginModalOpen}
                    onClose={() => setIsLoginModalOpen(false)}
                />
            </div>
        </BrowserRouter>
    )
}

export default App
