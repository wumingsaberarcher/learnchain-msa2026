import { Flame, Target, Award } from 'lucide-react'

export default function RightPanel() {
    return (
        <div className="w-80 bg-zinc-900 border-l border-zinc-800 h-screen fixed right-0 top-0 p-6 overflow-y-auto">
            {/* 今日打卡 */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-white">
                        <Target className="w-5 h-5" />
                        <span className="font-semibold">今日打卡</span>
                    </div>
                    <span className="text-emerald-400 text-sm font-medium">3/5</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full w-3/5 bg-emerald-500 rounded-full" />
                </div>
            </div>

            {/* 当前连击 */}
            <div className="bg-zinc-800 rounded-3xl p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <Flame className="w-6 h-6 text-orange-500" />
                    <span className="font-semibold text-white">当前连击</span>
                </div>
                <div className="text-6xl font-bold text-orange-500 tracking-tighter">47</div>
                <p className="text-sm text-zinc-400 mt-1">天 · 继续保持！</p>
            </div>

            {/* 解锁成就提示 */}
            <div>
                <div className="flex items-center gap-2 mb-4 text-white">
                    <Award className="w-5 h-5" />
                    <span className="font-semibold">解锁新成就</span>
                </div>
                <div className="bg-zinc-800 rounded-3xl p-5 text-sm">
                    <p className="text-zinc-400">再坚持 3 天，即可解锁「习惯大师」成就</p>
                </div>
            </div>
        </div>
    )
}