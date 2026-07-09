import { useState } from 'react'
import { useHabitStore } from '../stores/habitStore'

interface LoginModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
    const [mode, setMode] = useState<'login' | 'register'>('login')
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [isLoading, setIsLoading] = useState(false)

    const { login } = useHabitStore()

    if (!isOpen) return null

    const handleSubmit = async () => {
        if (!username || !password) {
            alert('请输入用户名和密码')
            return
        }

        setIsLoading(true)

        if (mode === 'login') {
            // 登录
            const success = await login(username, password)
            if (success) {
                onClose()
                setUsername('')
                setPassword('')
            }
        } else {
            // 注册
            try {
                const res = await fetch('http://localhost:5000/api/user/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password }),
                })

                if (!res.ok) {
                    const error = await res.text()
                    alert(error || '注册失败，用户名可能已存在')
                } else {
                    alert('注册成功！请使用新账号登录')
                    setMode('login')
                    setPassword('')
                }
            } catch (err) {
                alert('注册出错，请稍后重试')
            }
        }

        setIsLoading(false)
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 w-full max-w-md">
                <h2 className="text-2xl font-bold mb-6 text-center">
                    {mode === 'login' ? '登录' : '注册'}
                </h2>

                <div className="space-y-4">
                    <input
                        type="text"
                        placeholder="用户名"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                        type="password"
                        placeholder="密码"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    />
                </div>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 border border-gray-300 rounded-xl hover:bg-gray-50"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="flex-1 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {isLoading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
                    </button>
                </div>

                {/* 切换登录/注册 */}
                <div className="text-center mt-4 text-sm">
                    {mode === 'login' ? (
                        <span>
                            还没有账号？{' '}
                            <button
                                onClick={() => setMode('register')}
                                className="text-indigo-600 hover:underline"
                            >
                                去注册
                            </button>
                        </span>
                    ) : (
                        <span>
                            已有账号？{' '}
                            <button
                                onClick={() => setMode('login')}
                                className="text-indigo-600 hover:underline"
                            >
                                去登录
                            </button>
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}