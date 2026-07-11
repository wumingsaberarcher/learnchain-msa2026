import { useMemo, useState } from 'react'
import { X, ChevronLeft, ChevronRight, Plus, Trash2, Calendar, Target, Repeat, Clock, Zap } from 'lucide-react'
import type { CreateHabitPayload, CreateMilestonePayload, HabitType } from '../utils/habitHelpers'
import { getDefaultMilestoneXP, getDifficultyXP, isDuplicateHabitName } from '../utils/habitHelpers'
import { useTranslation } from '../stores/languageStore'
import type { TranslationKey } from '../i18n/translations'

interface Props {
    onClose: () => void
    onSubmit: (payload: CreateHabitPayload) => Promise<void>
    existingNames: string[]
}

const HABIT_TYPE_CONFIG: { type: HabitType; icon: typeof Repeat; nameKey: TranslationKey; descKey: TranslationKey }[] = [
    { type: 'Daily', icon: Repeat, nameKey: 'wizard.type.daily', descKey: 'wizard.type.dailyDesc' },
    { type: 'EveryOtherDay', icon: Clock, nameKey: 'wizard.type.everyOther', descKey: 'wizard.type.everyOtherDesc' },
    { type: 'Weekly', icon: Calendar, nameKey: 'wizard.type.weekly', descKey: 'wizard.type.weeklyDesc' },
    { type: 'OneTime', icon: Target, nameKey: 'wizard.type.oneTime', descKey: 'wizard.type.oneTimeDesc' },
]

const DIFFICULTY_CONFIG = [
    { level: 1, nameKey: 'wizard.diff.easy' as TranslationKey, xp: 10, descKey: 'wizard.diff.easyDesc' as TranslationKey },
    { level: 2, nameKey: 'wizard.diff.medium' as TranslationKey, xp: 20, descKey: 'wizard.diff.mediumDesc' as TranslationKey },
    { level: 3, nameKey: 'wizard.diff.hard' as TranslationKey, xp: 30, descKey: 'wizard.diff.hardDesc' as TranslationKey },
]

function toDateString(date: Date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

export default function CreateHabitWizard({ onClose, onSubmit, existingNames }: Props) {
    const { t, language } = useTranslation()
    const [step, setStep] = useState(1)
    const [name, setName] = useState('')
    const [nameError, setNameError] = useState('')
    const [habitType, setHabitType] = useState<HabitType>('Daily')
    const [difficulty, setDifficulty] = useState(1)
    const [dueDate, setDueDate] = useState('')
    const [calendarMonth, setCalendarMonth] = useState(() => new Date())
    const [milestones, setMilestones] = useState<CreateMilestonePayload[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)

    const totalSteps = habitType === 'OneTime' ? 4 : 3
    const milestoneXP = getDefaultMilestoneXP(difficulty)
    const finalXP = getDifficultyXP(difficulty)

    const weekdays = language === 'zh'
        ? ['日', '一', '二', '三', '四', '五', '六']
        : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

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

    const validateName = () => {
        if (!name.trim()) return false
        if (isDuplicateHabitName(name, existingNames)) {
            setNameError(t('habits.nameDuplicate'))
            return false
        }
        setNameError('')
        return true
    }

    const addMilestone = () => {
        const defaultDate = dueDate || toDateString(new Date())
        setMilestones(prev => [
            ...prev,
            {
                title: `${t('wizard.milestoneDefault')} ${prev.length + 1}`,
                dueDate: defaultDate,
                xpValue: milestoneXP,
                sortOrder: prev.length,
            },
        ])
    }

    const handleCreate = async () => {
        if (!validateName()) return
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
        if (step === 1) return name.trim().length > 0 && !isDuplicateHabitName(name, existingNames)
        if (step === 2) return !!habitType
        if (step === 3) return difficulty >= 1
        if (step === 4 && habitType === 'OneTime') return !!dueDate
        return true
    }

    const handleNext = () => {
        if (step === 1 && !validateName()) return
        setStep(step + 1)
    }

    return (
        <div className="habits-modal-overlay" onClick={onClose}>
            <div className="habits-modal habits-wizard" onClick={e => e.stopPropagation()}>
                <div className="habits-modal-header">
                    <div>
                        <h3 className="habits-modal-title">{t('wizard.title')}</h3>
                        <p className="habits-wizard-step">{t('wizard.step')} {step} / {totalSteps}</p>
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
                        <label className="habits-wizard-label">{t('wizard.nameLabel')}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => {
                                setName(e.target.value)
                                if (nameError) setNameError('')
                            }}
                            onBlur={validateName}
                            placeholder={t('wizard.namePlaceholder')}
                            className={`habit-edit-input${nameError ? ' input-error' : ''}`}
                            style={{ width: '100%' }}
                            autoFocus
                        />
                        {nameError && <p className="habits-wizard-error">{nameError}</p>}
                    </div>
                )}

                {step === 2 && (
                    <div className="habits-wizard-body">
                        <label className="habits-wizard-label">{t('wizard.typeLabel')}</label>
                        <div className="habits-type-grid">
                            {HABIT_TYPE_CONFIG.map(({ type, icon: Icon, nameKey, descKey }) => (
                                <button
                                    key={type}
                                    type="button"
                                    className={`habits-type-card${habitType === type ? ' selected' : ''}`}
                                    onClick={() => setHabitType(type)}
                                >
                                    <Icon className="w-5 h-5" />
                                    <span className="habits-type-name">{t(nameKey)}</span>
                                    <span className="habits-type-desc">{t(descKey)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="habits-wizard-body">
                        <label className="habits-wizard-label">{t('wizard.difficultyLabel')}</label>
                        <div className="habits-difficulty-grid">
                            {DIFFICULTY_CONFIG.map(d => (
                                <button
                                    key={d.level}
                                    type="button"
                                    className={`habits-difficulty-card${difficulty === d.level ? ' selected' : ''}`}
                                    onClick={() => setDifficulty(d.level)}
                                >
                                    <Zap className="w-4 h-4" />
                                    <span className="habits-difficulty-name">{t(d.nameKey)}</span>
                                    <span className="habits-difficulty-xp">+{d.xp} XP</span>
                                    <span className="habits-type-desc">{t(d.descKey)}</span>
                                </button>
                            ))}
                        </div>
                        {habitType === 'OneTime' && (
                            <p className="habits-wizard-hint">
                                {t('wizard.onetimeHint', { milestone: milestoneXP, final: finalXP })}
                            </p>
                        )}
                    </div>
                )}

                {step === 4 && habitType === 'OneTime' && (
                    <div className="habits-wizard-body">
                        <label className="habits-wizard-label">{t('wizard.dueDateLabel')}</label>
                        <div className="habits-calendar">
                            <div className="habits-calendar-header">
                                <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}>
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span>
                                    {calendarMonth.getFullYear()}
                                    {language === 'zh' ? ' 年 ' : '/'}
                                    {calendarMonth.getMonth() + 1}
                                    {language === 'zh' ? ' 月' : ''}
                                </span>
                                <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="habits-calendar-weekdays">
                                {weekdays.map(d => <span key={d}>{d}</span>)}
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
                                {t('wizard.dueDateSelected')} {dueDate}
                            </p>
                        )}

                        <div className="habits-milestone-section">
                            <div className="habits-milestone-header">
                                <label className="habits-wizard-label">{t('wizard.milestoneLabel')}</label>
                                <button type="button" className="btn-habit btn-habit-ghost" onClick={addMilestone}>
                                    <Plus className="w-3.5 h-3.5 inline mr-1" /> {t('wizard.addMilestone')}
                                </button>
                            </div>
                            {milestones.length === 0 ? (
                                <p className="habits-wizard-hint">{t('wizard.noMilestoneHint')}</p>
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
                                                placeholder={t('wizard.milestonePlaceholder')}
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
                            {t('wizard.prev')}
                        </button>
                    ) : (
                        <button type="button" className="btn-habit btn-habit-ghost" onClick={onClose}>{t('auth.cancel')}</button>
                    )}

                    {step < totalSteps ? (
                        <button
                            type="button"
                            className="btn-habit btn-habit-checkin"
                            disabled={!canNext()}
                            onClick={handleNext}
                        >
                            {t('wizard.next')}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="btn-habit btn-habit-checkin"
                            disabled={isSubmitting || !canNext()}
                            onClick={handleCreate}
                        >
                            {isSubmitting ? t('wizard.creating') : t('wizard.create')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
