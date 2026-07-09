import { useEffect } from 'react'
import { useHabitStore } from '../stores/habitStore'

export default function Dashboard() {
    const {
        habits,
        fetchHabits,
        currentUser,
        isLoggedIn
    } = useHabitStore()

    // 只在登录后才拉取习惯数据
    useEffect(() => {
        if (isLoggedIn) {
            fetchHabits()
        }
    }, [fetchHabits, isLoggedIn])

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">仪表盘</h1>
            <p className="text-gray-600 mb-8">
                {isLoggedIn && currentUser
                    ? `欢迎回来，${currentUser.username}！`
                    : '欢迎回来！这里展示你的学习进度和成就。'}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 总习惯数 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border">
                    <div className="text-sm text-gray-500 mb-1">我的习惯</div>
                    <div className="text-5xl font-bold text-indigo-600">{habits.length}</div>
                    <div className="text-sm text-gray-500 mt-1">个进行中</div>
                </div>

                {/* 真实 XP */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border">
                    <div className="text-sm text-gray-500 mb-1">总经验值</div>
                    <div className="text-5xl font-bold text-emerald-600">
                        {currentUser ? currentUser.totalXP : 0}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">XP</div>
                </div>

                {/* 真实等级 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border">
                    <div className="text-sm text-gray-500 mb-1">当前等级</div>
                    <div className="text-5xl font-bold text-orange-500">
                        Level {currentUser ? currentUser.level : 1}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                        {currentUser ? `距离下一级还需 ${100 - (currentUser.totalXP % 100)} XP` : ''}
                    </div>
                </div>
            </div>

            {!isLoggedIn && (
                <div className="mt-8 p-6 bg-yellow-50 border border-yellow-200 rounded-2xl text-yellow-700">
                    提示：登录后可查看你的真实 XP 和等级数据。
                </div>
            )}
        </div>
    )
}