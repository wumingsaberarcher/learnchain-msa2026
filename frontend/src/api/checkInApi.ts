import { apiFetch, authHeaders } from './http'

export interface CheckInPayload {
    habitId: number
    milestoneId?: number
    notes?: string
    fromFocusMode?: boolean
    focusSeconds?: number
    estimatedMinutes?: number
}

export interface CheckInResult {
    id: number
    habitId: number
    userId: number
    completedAt: string
    xpEarned: number
    baseXp?: number
    focusBonusXp?: number
    notes?: string
    milestoneId?: number
    newlyUnlocked?: string[]
    affectionAwarded?: number
    affectionPoints?: number
    affectionTierKey?: string
    affectionGainedToday?: number
    affectionDailyCap?: number
    trustLevel?: number
    trustPoints?: number
    trustStageKey?: string
    trustAddressKey?: string
    trustPromotedToObserve?: boolean
    trustCurriculumAwarded?: number
    trustLeveledUp?: boolean
    trustCompletedCount?: number
    trustLessonsToStage2?: number
}

export async function createCheckIn(payload: CheckInPayload): Promise<CheckInResult> {
    const res = await apiFetch('/checkin', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
    })
    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText || 'Failed to check in')
    }
    const data = await res.json()
    const result: CheckInResult = {
        id: data.id ?? data.Id,
        habitId: data.habitId ?? data.HabitId,
        userId: data.userId ?? data.UserId,
        completedAt: data.completedAt ?? data.CompletedAt,
        xpEarned: data.xpEarned ?? data.XPEarned ?? 0,
        baseXp: data.baseXp ?? data.BaseXp,
        focusBonusXp: data.focusBonusXp ?? data.FocusBonusXp ?? 0,
        notes: data.notes ?? data.Notes,
        milestoneId: data.milestoneId ?? data.MilestoneId,
        newlyUnlocked: data.newlyUnlocked ?? data.NewlyUnlocked ?? [],
        affectionAwarded: data.affectionAwarded ?? data.AffectionAwarded,
        affectionPoints: data.affectionPoints ?? data.AffectionPoints,
        affectionTierKey: data.affectionTierKey ?? data.AffectionTierKey,
        affectionGainedToday: data.affectionGainedToday ?? data.AffectionGainedToday,
        affectionDailyCap: data.affectionDailyCap ?? data.AffectionDailyCap,
        trustLevel: data.trustLevel ?? data.TrustLevel,
        trustPoints: data.trustPoints ?? data.TrustPoints,
        trustStageKey: data.trustStageKey ?? data.TrustStageKey,
        trustAddressKey: data.trustAddressKey ?? data.TrustAddressKey,
        trustPromotedToObserve: data.trustPromotedToObserve ?? data.TrustPromotedToObserve,
        trustCurriculumAwarded: data.trustCurriculumAwarded ?? data.TrustCurriculumAwarded,
        trustLeveledUp: data.trustLeveledUp ?? data.TrustLeveledUp,
        trustCompletedCount: data.trustCompletedCount ?? data.TrustCompletedCount,
        trustLessonsToStage2: data.trustLessonsToStage2 ?? data.TrustLessonsToStage2,
    }
    if (result.affectionPoints != null) {
        const { useAffectionStore } = await import('../stores/affectionStore')
        useAffectionStore.getState().applyAward({
            awarded: result.affectionAwarded,
            points: result.affectionPoints,
            tierKey: result.affectionTierKey,
            gainedToday: result.affectionGainedToday,
            dailyCap: result.affectionDailyCap,
        })
    }
    if (result.trustLevel != null || result.trustPoints != null) {
        const { useTrustStore } = await import('../stores/trustStore')
        useTrustStore.getState().applySnapshot({
            level: result.trustLevel,
            points: result.trustPoints,
            stageKey: result.trustStageKey,
            addressKey: result.trustAddressKey,
            completedCount: result.trustCompletedCount,
            lessonsToStage2: result.trustLessonsToStage2,
        })
    }
    return result
}

export async function getAllCheckIns() {
    const res = await apiFetch('/checkin')
    if (!res.ok) throw new Error('Failed to fetch check-ins')
    return res.json()
}

export async function getTodayCheckedHabitIds(): Promise<number[]> {
    const res = await apiFetch('/checkin/today')
    if (!res.ok) throw new Error('Failed to fetch today check-ins')
    return res.json()
}
