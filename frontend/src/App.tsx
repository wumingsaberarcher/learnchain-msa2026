import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Target } from 'lucide-react'
import Dashboard from './pages/ChainDashboard'
import Habits from './pages/Habits'
import Profile from './pages/Profile'
import Achievements from './pages/Achievements'
import LoginModal from './components/LoginModal'
import BackgroundAnimation from './components/BackgroundAnimation'
import ThemeLocaleToggle from './components/ThemeLocaleToggle'
import UserProfileMenu from './components/UserProfileMenu'
import BadgeUnlockModal from './components/BadgeUnlockModal'
import AiAssistant from './components/ai/AiAssistant'
import { useHabitStore } from './stores/habitStore'
import { useAchievementStore } from './stores/achievementStore'
import { useTranslation } from './stores/settingsStore'

function App() {
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
    const { isLoggedIn, currentUser } = useHabitStore()
    const { fetchProfile, syncAchievements } = useAchievementStore()
    const { t, theme } = useTranslation()

    useEffect(() => {
        if (isLoggedIn) {
            fetchProfile().then(() => syncAchievements())
        }
    }, [isLoggedIn, fetchProfile, syncAchievements])

    return (
        <BrowserRouter>
            <div className={`app-shell min-h-screen theme-${theme}`}>
                <BackgroundAnimation />

                <header>
                    <nav>
                        <NavLink to="/" className="logo">
                            <div className="logo-icon">
                                <Target className="w-6 h-6" />
                            </div>
                            <span className="logo-text">LearnChain</span>
                        </NavLink>

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
                            </ul>

                            <ThemeLocaleToggle />

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
                    </Routes>
                </main>

                <BadgeUnlockModal />
                <AiAssistant />

                <LoginModal
                    isOpen={isLoginModalOpen}
                    onClose={() => setIsLoginModalOpen(false)}
                />
            </div>
        </BrowserRouter>
    )
}

export default App
