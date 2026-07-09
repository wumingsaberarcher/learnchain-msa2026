import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Habits from './pages/Habits'
import LoginModal from './components/LoginModal'
import { useHabitStore } from './stores/habitStore'

function App() {
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
    const { isLoggedIn, currentUser, logout } = useHabitStore()

    return (
        <BrowserRouter>
            <div className="min-h-screen bg-gray-50">
                {/* 顶部导航栏 */}
                <nav className="bg-white border-b">
                    <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                        <div className="flex items-center gap-10">
                            <NavLink to="/" className="text-2xl font-bold text-indigo-600">
                                LearnChain
                            </NavLink>
                            <div className="flex items-center gap-6 text-sm">
                                <NavLink
                                    to="/"
                                    className={({ isActive }) =>
                                        isActive ? "text-indigo-600 font-medium" : "text-gray-600 hover:text-gray-900"
                                    }
                                >
                                    仪表盘
                                </NavLink>
                                <NavLink
                                    to="/habits"
                                    className={({ isActive }) =>
                                        isActive ? "text-indigo-600 font-medium" : "text-gray-600 hover:text-gray-900"
                                    }
                                >
                                    我的习惯
                                </NavLink>
                            </div>
                        </div>

                        {/* 登录状态显示区域 */}
                        <div>
                            {isLoggedIn && currentUser ? (
                                <div className="flex items-center gap-4">
                                    <span className="text-gray-700">
                                        {currentUser.username}
                                    </span>
                                    <button
                                        onClick={logout}
                                        className="px-4 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                                    >
                                        登出
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsLoginModalOpen(true)}
                                    className="px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium"
                                >
                                    登录
                                </button>
                            )}
                        </div>
                    </div>
                </nav>

                {/* 页面内容 */}
                <main className="max-w-6xl mx-auto px-6 py-8">
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/habits" element={<Habits />} />
                    </Routes>
                </main>

                {/* 登录弹窗 */}
                <LoginModal
                    isOpen={isLoginModalOpen}
                    onClose={() => setIsLoginModalOpen(false)}
                />
            </div>
        </BrowserRouter>
    )
}

export default App