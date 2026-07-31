import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Target } from 'lucide-react'
import Dashboard from './pages/ChainDashboard'
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
import AppSidebar from './components/AppSidebar'
import BgmPlayer from './components/BgmPlayer'
import { useHabitStore } from './stores/habitStore'
import { useAchievementStore } from './stores/achievementStore'
import { useIdleRestStore } from './stores/idleRestStore'
import { useBgmStore } from './stores/bgmStore'
import { useTranslation } from './stores/settingsStore'
import { isStaffRole } from './api/adminApi'

function App() {
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
    const { isLoggedIn, currentUser } = useHabitStore()
    const { fetchProfile, syncAchievements } = useAchievementStore()
    const { t, theme } = useTranslation()
    const isResting = useIdleRestStore(s => s.isResting)
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
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/achievements" element={<Achievements />} />
                        <Route path="/admin" element={<Admin />} />
                    </Routes>
                </main>

                <BadgeUnlockModal />
                {!isResting && (
                    <div className="theme-locale-fab">
                        <ThemeLocaleToggle />
                    </div>
                )}
                {!isResting && <AiAssistant />}
                <IdleRestOverlay pauseIdle={isLoginModalOpen} />

                <LoginModal
                    isOpen={isLoginModalOpen}
                    onClose={() => setIsLoginModalOpen(false)}
                />
            </div>
        </BrowserRouter>
    )
}

export default App
