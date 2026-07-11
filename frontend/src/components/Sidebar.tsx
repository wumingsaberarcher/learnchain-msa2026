import { Home, Target, Trophy, BarChart3 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

const navItems = [
    { icon: Home, label: '仪表盘', path: '/' },
    { icon: Target, label: '我的习惯', path: '/habits' },
    { icon: Trophy, label: '成就', path: '/achievements' },
    { icon: BarChart3, label: '统计数据', path: '/stats' },
]

export default function Sidebar() {
    const location = useLocation()

    return (
        <div className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col">
            <div className="px-8 py-8">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center">
                        <Target className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-2xl font-bold text-white tracking-tight">LearnChain</span>
                </div>
            </div>

            <div className="px-4 flex-1">
                {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = location.pathname === item.path
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl mb-1 text-base font-medium transition-all
                ${isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                        >
                            <Icon className="w-5 h-5" />
                            {item.label}
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}