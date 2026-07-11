import { useEffect } from 'react'
import { useHabitStore } from '../stores/habitStore'
import { Flame, Target, Zap, Trophy, ArrowRight } from 'lucide-react'

export default function Dashboard() {
    const { habits, fetchHabits, currentUser, isLoggedIn, todayCheckedHabitIds } = useHabitStore()

    useEffect(() => {
        if (isLoggedIn) fetchHabits()
    }, [fetchHabits, isLoggedIn])

    const todayCheckedCount = todayCheckedHabitIds.length
    const totalHabits = habits.length
    const currentStreak = Math.floor((currentUser?.totalXP || 0) / 10)

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white">
            {/* Hero Section - 参考模板风格 */}
            <div className="relative pt-20 pb-16 px-8">
                <div className="max-w-5xl mx-auto text-center">
                    <h1 className="text-7xl font-bold tracking-tighter mb-4">
                        欢迎回来
                    </h1>
                    <p className="text-2xl text-zinc-400 mb-10">
                        今天也要坚持打卡哦 ~
                    </p>

                    {/* 大连击展示 */}
                    <div className="flex justify-center items-center gap-4 mb-12">
                        <div className="flex items-center gap-3 text-orange-400">
                            <Flame className="w-20 h-20" />
                            <div className="text-[120px] font-bold tracking-[-8px] leading-none">
                                {currentUser?.level || 1}
                            </div>
                        </div>
                        <div className="text-left">
                            <div className="text-2xl text-orange-400">当前等级</div>
                            <div className="text-xl text-zinc-400">继续保持！</div>
                        </div>
                    </div>

                    {/* 核心统计卡片 - 类似模板的 stat 风格 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center hover:border-zinc-700 transition-all">
                            <Target className="w-10 h-10 mx-auto mb-4 text-indigo-400" />
                            <div className="text-6xl font-bold tracking-tighter">{totalHabits}</div>
                            <div className="text-zinc-400 mt-2">我的习惯</div>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center hover:border-zinc-700 transition-all">
                            <Flame className="w-10 h-10 mx-auto mb-4 text-orange-400" />
                            <div className="text-6xl font-bold tracking-tighter">{currentStreak}</div>
                            <div className="text-zinc-400 mt-2">当前连击（天）</div>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center hover:border-zinc-700 transition-all">
                            <Zap className="w-10 h-10 mx-auto mb-4 text-emerald-400" />
                            <div className="text-6xl font-bold tracking-tighter">{currentUser?.totalXP || 0}</div>
                            <div className="text-zinc-400 mt-2">总经验值</div>
                        </div>

                        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center hover:border-zinc-700 transition-all">
                            <Trophy className="w-10 h-10 mx-auto mb-4 text-rose-400" />
                            <div className="text-6xl font-bold tracking-tighter">{todayCheckedCount}</div>
                            <div className="text-zinc-400 mt-2">今日已打卡</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 鼓励区域 - 类似模板的 register / cta 风格 */}
            <div className="max-w-4xl mx-auto px-8 pb-20">
                <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center">
                    <h2 className="text-4xl font-bold tracking-tight mb-4">坚持就是胜利</h2>
                    <p className="text-xl text-zinc-400 mb-8 max-w-md mx-auto">
                        每一次打卡，都是在为更好的自己投资。
                    </p>
                    <button
                        onClick={() => window.location.href = '/habits'}
                        className="inline-flex items-center gap-3 px-10 py-4 bg-white text-zinc-900 rounded-2xl text-lg font-semibold hover:bg-zinc-100 active:scale-[0.985] transition-all"
                    >
                        去打卡 <ArrowRight className="w-6 h-6" />
                    </button>
                </div>
            </div>
        </div>
    )
}