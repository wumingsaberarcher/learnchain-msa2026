import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
    title: string
    value: string | number
    subtitle?: string
    icon?: LucideIcon
    color?: 'indigo' | 'orange' | 'emerald' | 'rose'
}

export default function StatCard({ title, value, subtitle, icon: Icon, color = 'indigo' }: StatCardProps) {
    const colorClasses = {
        indigo: 'bg-indigo-500/10 text-indigo-400',
        orange: 'bg-orange-500/10 text-orange-400',
        emerald: 'bg-emerald-500/10 text-emerald-400',
        rose: 'bg-rose-500/10 text-rose-400',
    }

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 hover:border-zinc-700 transition-all group">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <p className="text-sm text-zinc-400 mb-3 tracking-widest">{title}</p>
                    <p className="text-7xl font-bold tracking-[-3px] text-white">{value}</p>
                </div>

                {Icon && (
                    <div className={`p-5 rounded-2xl shadow-inner ${colorClasses[color]} group-hover:scale-110 transition-transform`}>
                        <Icon className="w-9 h-9" />
                    </div>
                )}
            </div>
            {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
        </div>
    )
}