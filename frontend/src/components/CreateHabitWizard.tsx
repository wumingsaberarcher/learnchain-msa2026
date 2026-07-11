import { useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Plus, Trash2, Calendar, Target, Repeat, Clock, Zap } from 'lucide-react'
import type { CreateHabitPayload, CreateMilestonePayload, HabitType } from '../utils/habitHelpers'
import {
    getDefaultMilestoneXP,
    getDifficultyLabel,
    getDifficultyXP,
    getHabitTypeLabel,
} from '../utils/habitHelpers'

interface Props {
    onClose: () => void
    onSubmit: (payload: CreateHabitPayload) => Promise<void>
}

const HABIT_TYPES: { type: HabitType; icon: typeof Repeat; desc: string }[] = [
    { type: 'Daily', icon: Repeat, desc: '每天打卡，养成长期习惯' },
    { type: 'EveryOtherDay', icon: Clock, desc: '每隔一天打卡一次' },
    { type: 'Weekly', icon: Calendar, desc: '每周打卡，适合低频任务' },
    { type: 'OneTime', icon: Target, desc: '一次性目标，可拆分小打卡点' },
]

const DIFFICULTIES = [
    { level: 1, label: '简单', xp: 10, desc: '轻松完成，+10 XP' },
    { level: 2, label: '中等', xp: 20, desc: '需要一定毅力，+20 XP' },
    { level: 3, label: '困难', xp: 30, desc: '挑战自我，+30 XP' },
]

function toDateString(date: Date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

export default function CreateHabitWizard({ onClose, onSubmit }: Props) {
    const [step, setStep] = useState(1)
    const [name, setName] = useState('')
    const [habitType, setHabitType] = useState<HabitType>('Daily')
    const [difficulty, setDifficulty] = useState(1)
    const [dueDate, setDueDate] = useState('')
    const [calendarMonth, setCalendarMonth] = useState(() => new Date())
    const [milestones, setMilestones] = useState<CreateMilestonePayload[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)

    const totalSteps = habitType === 'OneTime' ? 4 : 3
    const milestoneXP = getDefaultMilestoneXP(difficulty)
    const finalXP = getDifficultyXP(difficulty)

    const calendarDays = useMemo(() => {
        const year = calendarMonth.getFullYear()
        const month = calendarMonth.getMonth()
        const firstDay = new Date(year, month, 1)
        const lastDay = new Date(year, month + 1, 0)
        const startPad = firstDay.getDay()
        const days: (Date | null)[] = []

        for (let i = 0; i < startPad; i++) days.push(null)
        for (let d = 1; d <= lastDay.getDate(); d++) {
            days.push(new Date(year, month, d))
        }
        return days
    }, [calendarMonth])

    const addMilestone = () => {
        const defaultDate = dueDate || toDateString(new Date())
        setMilestones(prev => [
            ...prev,
            {
                title: `小目标 ${prev.length + 1}`,
                dueDate: defaultDate,
                xpValue: milestoneXP,
                sortOrder: prev.length,
            },
        ])
    }

    const handleCreate = async () => {
        if (!name.trim()) return
        setIsSubmitting(true)
        try {
            const payload: CreateHabitPayload = {
                name: name.trim(),
                habitType,
                difficulty,
            }

            if (habitType === 'OneTime') {
                payload.dueDate = dueDate || toDateString(new Date())
                if (milestones.length > 0) {
                    payload.milestones = milestones.map((m, i) => ({
                        ...m,
                        sortOrder: i,
                        xpValue: m.xpValue || milestoneXP,
                    }))
                }
            }

            await onSubmit(payload)
            onClose()
        } finally {
            setIsSubmitting(false)
        }
    }

    const canNext = () => {
        if (step === 1) return name.trim().length > 0
        if (step === 2) return !!habitType
        if (step === 3) return difficulty >= 1
        if (step === 4 && habitType === 'OneTime') return !!dueDate
        return true
    }

    return (
        <div className="habits-modal-overlay" onClick={onClose}>
            <div className="habits-modal habits-wizard" onClick={e => e.stopPropagation()}>
                <div className="habits-modal-header">
                    <div>
                        <h3 className="habits-modal-title">新建习惯</h3>
                        <p className="habits-wizard-step">步骤 {step} / {totalSteps}</p>
                    </div>
                    <button type="button" className="habits-modal-close" onClick={onClose}>
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="habits-wizard-progress">
                    {Array.from({ length: totalSteps }).map((_, i) => (
                        <div key={i} className={`habits-wizard-dot${i + 1 <= step ? ' active' : ''}`} />
                    ))}
                </div>

                {step === 1 && (
                    <div className="habits-wizard-body">
                        <label className="habits-wizard-label">给习惯取个名字</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="例如：每天复习数据结构"
                            className="habit-edit-input"
                            style={{ width: '100%' }}
                            autoFocus
                        />
                    </div>
                )}

                {step === 2 && (
                    <div className="habits-wizard-body">
                        <label className="habits-wizard-label">选择习惯类型</label>
                        <div className="habits-type-grid">
                            {HABIT_TYPES.map(({ type, icon: Icon, desc }) => (
                                <button
                                    key={type}
                                    type="button"
                                    className={`habits-type-card${habitType === type ? ' selected' : ''}`}
                                    onClick={() => setHabitType(type)}
                                >
                                    <Icon className="w-5 h-5" />
                                    <span className="habits-type-name">{getHabitTypeLabel(type)}</span>
                                    <span className="habits-type-desc">{desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="habits-wizard-body">
                        <label className="habits-wizard-label">选择难易程度（决定经验值）</label>
                        <div className="habits-difficulty-grid">
                            {DIFFICULTIES.map(d => (
                                <button
                                    key={d.level}
                                    type="button"
                                    className={`habits-difficulty-card${difficulty === d.level ? ' selected' : ''}`}
                                    onClick={() => setDifficulty(d.level)}
                                >
                                    <Zap className="w-4 h-4" />
                                    <span className="habits-difficulty-name">{d.label}</span>
                                    <span className="habits-difficulty-xp">+{d.xp} XP</span>
                                    <span className="habits-type-desc">{d.desc}</span>
                                </button>
                            ))}
                        </div>
                        {habitType === 'OneTime' && (
                            <p className="habits-wizard-hint">
                                小打卡点默认 +{milestoneXP} XP，最终完成 +{finalXP} XP
                            </p>
                        )}
                    </div>
                )}

                {step === 4 && habitType === 'OneTime' && (
                    <div className="habits-wizard-body">
                        <label className="habits-wizard-label">选择截止日期（本月日历）</label>
                        <div className="habits-calendar">
                            <div className="habits-calendar-header">
                                <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span>{calendarMonth.getFullYear()} 年 {calendarMonth.getMonth() + 1} 月</span>
                                <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="habits-calendar-weekdays">
                                {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                                    <span key={d}>{d}</span>
                                ))}
                            </div>
                            <div className="habits-calendar-grid">
                                {calendarDays.map((date, i) => {
                                    if (!date) return <span key={`empty-${i}`} className="habits-calendar-day empty" />
                                    const ds = toDateString(date)
                                    const isSelected = dueDate === ds
                                    const isPast = date < new Date(new Date().setHours(0, 0, 0, 0))
                                    return (
                                        <button
                                            key={ds}
                                            type="button"
                                            disabled={isPast}
                                            className={`habits-calendar-day${isSelected ? ' selected' : ''}${isPast ? ' past' : ''}`}
                                            onClick={() => setDueDate(ds)}
                                        >
                                            {date.getDate()}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {dueDate && (
                            <p className="habits-wizard-selected-date">
                                截止日期：{dueDate}
                            </p>
                        )}

                        <div className="habits-milestone-section">
                            <div className="habits-milestone-header">
                                <label className="habits-wizard-label">拆分小目标（可选）</label>
                                <button type="button" className="btn-habit btn-habit-ghost" onClick={addMilestone}>
                                    <Plus className="w-3.5 h-3.5 inline mr-1" /> 添加小打卡点
                                </button>
                            </div>
                            {milestones.length === 0 ? (
                                <p className="habits-wizard-hint">不添加小目标时，到期日直接打卡即可完成。</p>
                            ) : (
                                <div className="habits-milestone-list">
                                    {milestones.map((m, index) => (
                                        <div key={index} className="habits-milestone-row">
                                            <input
                                                type="text"
                                                value={m.title}
                                                onChange={e => {
                                                    const next = [...milestones]
                                                    next[index] = { ...m, title: e.target.value }
                                                    setMilestones(next)
                                                }}
                                                className="habit-edit-input"
                                                placeholder="小目标名称"
                                            />
                                            <input
                                                type="date"
                                                value={m.dueDate}
                                                min={toDateString(new Date())}
                                                max={dueDate || undefined}
                                                onChange={e => {
                                                    const next = [...milestones]
                                                    next[index] = { ...m, dueDate: e.target.value }
                                                    setMilestones(next)
                                                }}
                                                className="habit-edit-input habits-date-input"
                                            />
                                            <span className="habits-milestone-xp">+{m.xpValue || milestoneXP} XP</span>
                                            <button
                                                type="button"
                                                className="habits-milestone-remove"
                                                onClick={() => setMilestones(milestones.filter((_, i) => i !== index))}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="habits-modal-actions">
                    {step > 1 ? (
                        <button type="button" className="btn-habit btn-habit-ghost" onClick={() => setStep(step - 1)}>
                            上一步
                        </button>
                    ) : (
                        <button type="button" className="btn-habit btn-habit-ghost" onClick={onClose}>取消</button>
                    )}

                    {step < totalSteps ? (
                        <button
                            type="button"
                            className="btn-habit btn-habit-checkin"
                            disabled={!canNext()}
                            onClick={() => setStep(step + 1)}
                        >
                            下一步
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn-habit btn-habit-checkin"
                            disabled={isSubmitting || !canNext()}
                            onClick={handleCreate}
                        >
                            {isSubmitting ? '创建中...' : '创建习惯'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
