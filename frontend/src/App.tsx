import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Target } from 'lucide-react'
import Dashboard from './pages/ChainDashboard'
import Habits from './pages/Habits'
import LoginModal from './components/LoginModal'
import BackgroundAnimation from './components/BackgroundAnimation'
import { useHabitStore } from './stores/habitStore'

function App() {
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
    const { isLoggedIn, currentUser, logout } = useHabitStore()

    return (
        <BrowserRouter>
            <div className="app-shell min-h-screen">
                <BackgroundAnimation />

                <header>
                    <nav>
                        <NavLink to="/" className="logo">
                            <div className="logo-icon">
                                <Target className="w-6 h-6 text-cyan-400" />
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
                                        仪表盘
                                    </NavLink>
                                </li>
                                <li>
                                    <NavLink
                                        to="/habits"
                                        className={({ isActive }) => (isActive ? 'active' : undefined)}
                                    >
                                        我的习惯
                                    </NavLink>
                                </li>
                            </ul>

                            <div className="nav-auth">
                                {isLoggedIn && currentUser ? (
                                    <>
                                        <span className="nav-username">{currentUser.username}</span>
                                        <button type="button" className="btn-nav-logout" onClick={logout}>
                                            登出
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-nav-login"
                                        onClick={() => setIsLoginModalOpen(true)}
                                    >
                                        登录
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
                    </Routes>
                </main>

                <LoginModal
                    isOpen={isLoginModalOpen}
                    onClose={() => setIsLoginModalOpen(false)}
                />
            </div>
        </BrowserRouter>
    )
}

export default App
