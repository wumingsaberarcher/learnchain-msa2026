import { useEffect, useState } from 'react'
import { useHabitStore } from '../stores/habitStore'
import { createCheckIn } from '../api/checkInApi'

export default function Habits() {
    const {
        habits,
        isLoading,
        error,
        fetchHabits,
        addHabit,
        updateHabit,
        deleteHabit,
        todayCheckedHabitIds,
        fetchTodayCheckedHabits,
        markHabitCheckedToday,
        isLoggedIn,
        addXPToCurrentUser,
        fetchCurrentUser,
    } = useHabitStore()

    const [showForm, setShowForm] = useState(false)
    const [newHabitName, setNewHabitName] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [checkInLoading, setCheckInLoading] = useState<number | null>(null)
    const [successMessage, setSuccessMessage] = useState('')
    const [editingHabit, setEditingHabit] = useState<any>(null)

    // 只在登录后才加载数据
    useEffect(() => {
        if (isLoggedIn) {
            fetchHabits()
            fetchTodayCheckedHabits()
        }
    }, [fetchHabits, fetchTodayCheckedHabits, isLoggedIn])

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => setSuccessMessage(''), 2500)
            return () => clearTimeout(timer)
        }
    }, [successMessage])

    const handleCreateHabit = async () => {
        if (!newHabitName.trim()) return
        setIsSubmitting(true)

        try {
            // 使用当前登录用户的 ID（更规范）
            const currentUserId = useHabitStore.getState().currentUser?.id || 1

            await addHabit({
                userId: currentUserId,
                name: newHabitName.trim(),
                frequency: 'Daily',
                completionType: 0,
                baseXP: 10,
                isActive: true,
            })

            setNewHabitName('')
            setShowForm(false)
            setSuccessMessage('习惯创建成功！')
        } catch (error: any) {
            console.error('创建习惯失败详情:', error)
            // 尝试显示后端返回的具体错误
            const message = error?.message || '创建失败，请重试'
            alert(message)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleUpdateHabit = async () => {
        if (!editingHabit || !editingHabit.name.trim()) return
        try {
            await updateHabit(editingHabit.id, { name: editingHabit.name.trim() })
            setEditingHabit(null)
            setSuccessMessage('习惯更新成功！')
            await fetchHabits()
        } catch {
            alert('更新失败')
        }
    }

    const handleDeleteHabit = async (id: number) => {
        if (!confirm('确定要删除这个习惯吗？')) return
        try {
            await deleteHabit(id)
            setSuccessMessage('习惯已删除')
        } catch {
            alert('删除失败')
        }
    }

    const handleCheckIn = async (habitId: number) => {
        setCheckInLoading(habitId)
        try {
            const response = await createCheckIn({ habitId, userId: 1 })
            setSuccessMessage('打卡成功！+10 XP')
            await fetchCurrentUser()
            markHabitCheckedToday(habitId)
        } catch (error) {
            console.error('打卡失败详情:', error)
            alert('打卡失败，请重试')
        } finally {
            setCheckInLoading(null)
        }
    }

    if (!isLoggedIn) {
        return (
            <div className="max-w-2xl mx-auto mt-12 text-center">
                <div className="bg-white border border-yellow-300 rounded-2xl p-10 shadow-sm">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">请先登录</h2>
                    <p className="text-gray-600 mb-6">登录后即可创建习惯并进行打卡。</p>
                    <button onClick={() => alert('请点击右上角「登录」按钮进行登录')} className="px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">
                        去登录
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold text-gray-900">我的习惯</h1>
                <button onClick={() => setShowForm(!showForm)} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-medium">
                    {showForm ? '取消' : '+ 新建习惯'}
                </button>
            </div>

            {successMessage && (
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl flex items-center gap-2">
                    ✅ {successMessage}
                </div>
            )}

            {showForm && (
                <div className="bg-white border rounded-2xl p-6 mb-8 shadow-sm">
                    <h3 className="font-semibold mb-4">创建新习惯</h3>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            value={newHabitName}
                            onChange={(e) => setNewHabitName(e.target.value)}
                            placeholder="例如：每天复习数据结构"
                            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateHabit()}
                        />
                        <button onClick={handleCreateHabit} disabled={isSubmitting || !newHabitName.trim()} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-medium">
                            {isSubmitting ? '创建中...' : '创建'}
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="text-center py-12 text-gray-500">加载中...</div>
            ) : error ? (
                <div className="text-center py-12 text-red-500">{error}</div>
            ) : habits.length === 0 ? (
                <div className="bg-white rounded-2xl border p-12 text-center">
                    <p className="text-gray-500">你还没有创建任何习惯</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {habits.map((habit) => (
                        <div key={habit.id} className="bg-white border rounded-2xl p-6 hover:shadow-md transition-all">
                            {editingHabit?.id === habit.id ? (
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        value={editingHabit.name}
                                        onChange={(e) => setEditingHabit({ ...editingHabit, name: e.target.value })}
                                        className="flex-1 border border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <button onClick={handleUpdateHabit} className="px-4 py-2 bg-green-600 text-white rounded-xl">保存</button>
                                    <button onClick={() => setEditingHabit(null)} className="px-4 py-2 border rounded-xl">取消</button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-semibold text-xl text-gray-900">{habit.name}</h3>
                                        <div className="flex items-center gap-3 mt-3 flex-wrap">
                                            <span className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                                                {habit.frequency}
                                            </span>
                                            <span className="text-sm text-emerald-600 font-medium">
                                                +{habit.baseXP} XP
                                            </span>

                                            {/* 新增：显示当前连击天数 */}
                                            {habit.currentStreak > 0 && (
                                                <span className="px-3 py-1 text-xs bg-orange-100 text-orange-700 rounded-full font-medium">
                                                    🔥 连击 {habit.currentStreak} 天
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleCheckIn(habit.id)}
                                            disabled={checkInLoading === habit.id || todayCheckedHabitIds.includes(habit.id)}
                                            className={`px-6 py-2 rounded-xl text-sm font-medium transition-colors ${todayCheckedHabitIds.includes(habit.id) ? 'bg-emerald-100 text-emerald-700 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                                        >
                                            {checkInLoading === habit.id ? '打卡中...' : todayCheckedHabitIds.includes(habit.id) ? '今日已打卡' : '打卡'}
                                        </button>

                                        <button onClick={() => setEditingHabit(habit)} className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-50">编辑</button>
                                        <button onClick={() => handleDeleteHabit(habit.id)} className="px-4 py-2 border border-red-300 text-red-600 rounded-xl text-sm hover:bg-red-50">删除</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}