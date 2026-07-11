import { describe, it, expect } from 'vitest'
import {
  getDifficultyXP,
  getDefaultMilestoneXP,
  isDuplicateHabitName,
  habitTypeKey,
  difficultyKey,
  formatCountdownI18n,
  getPendingMilestones,
} from '../utils/habitHelpers'
import { t } from '../i18n/translations'

describe('habitHelpers', () => {
  it('getDifficultyXP returns correct XP per difficulty', () => {
    expect(getDifficultyXP(1)).toBe(10)
    expect(getDifficultyXP(2)).toBe(20)
    expect(getDifficultyXP(3)).toBe(30)
  })

  it('getDefaultMilestoneXP scales with difficulty', () => {
    expect(getDefaultMilestoneXP(1)).toBe(5)
    expect(getDefaultMilestoneXP(3)).toBe(12)
  })

  it('isDuplicateHabitName is case-insensitive', () => {
    expect(isDuplicateHabitName('Read', ['read', 'Write'])).toBe(true)
    expect(isDuplicateHabitName('Run', ['Read', 'Write'])).toBe(false)
  })

  it('habitTypeKey maps types to translation keys', () => {
    expect(habitTypeKey('Weekly')).toBe('type.weekly')
    expect(habitTypeKey('OneTime')).toBe('type.oneTime')
    expect(habitTypeKey('Daily')).toBe('type.daily')
  })

  it('difficultyKey maps levels to translation keys', () => {
    expect(difficultyKey(2)).toBe('diff.medium')
    expect(difficultyKey(99)).toBe('diff.easy')
  })

  it('formatCountdownI18n formats overdue and remaining days', () => {
    const past = new Date()
    past.setDate(past.getDate() - 3)
    const future = new Date()
    future.setDate(future.getDate() + 7)

    expect(formatCountdownI18n(past.toISOString(), (k, p) => t(k, 'zh', p))).toContain('逾期')
    expect(formatCountdownI18n(future.toISOString().split('T')[0], (k, p) => t(k, 'zh', p))).toContain('还剩')
  })

  it('getPendingMilestones filters incomplete milestones', () => {
    const habit = {
      milestones: [
        { id: 1, isCompleted: true },
        { id: 2, isCompleted: false },
      ],
    } as any

    expect(getPendingMilestones(habit)).toHaveLength(1)
    expect(getPendingMilestones(habit)[0].id).toBe(2)
  })
})
