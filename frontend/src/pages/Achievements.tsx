import { useEffect, useMemo, useState } from 'react'
import { useAchievementStore } from '../stores/achievementStore'
import { useTranslation } from '../stores/settingsStore'
import { BADGE_DEFINITIONS, BADGE_CATEGORIES, type BadgeCategory } from '../badges/badgeDefinitions'
import BadgeCard from '../components/BadgeCard'
import { Trophy } from 'lucide-react'

export default function AchievementsPage() {
    const { achievements, fetchProfile, syncAchievements } = useAchievementStore()
    const { t } = useTranslation()
    const [filter, setFilter] = useState<BadgeCategory | 'all'>('all')

    useEffect(() => {
        fetchProfile().then(() => syncAchievements())
    }, [fetchProfile, syncAchievements])

    const unlockedSet = useMemo(
        () => new Set(achievements.filter(a => a.unlocked).map(a => a.badgeId)),
        [achievements]
    )

    const filtered = useMemo(
        () => filter === 'all'
            ? BADGE_DEFINITIONS
            : BADGE_DEFINITIONS.filter(b => b.category === filter),
        [filter]
    )

    const unlockedCount = achievements.filter(a => a.unlocked).length

    return (
        <div className="achievements-page">
            <div className="achievements-header">
                <Trophy className="w-10 h-10 achievements-header-icon" />
                <div>
                    <h1 className="achievements-title">{t('profile.achievements')}</h1>
                    <p className="achievements-subtitle">
                        {t('badge.progress', { unlocked: unlockedCount, total: BADGE_DEFINITIONS.length })}
                    </p>
                </div>
            </div>

            <div className="achievements-filters">
                <button
                    type="button"
                    className={`achievements-filter${filter === 'all' ? ' active' : ''}`}
                    onClick={() => setFilter('all')}
                >
                    {t('badge.all')}
                </button>
                {BADGE_CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        type="button"
                        className={`achievements-filter${filter === cat.id ? ' active' : ''}`}
                        onClick={() => setFilter(cat.id)}
                    >
                        {t(cat.labelKey)}
                    </button>
                ))}
            </div>

            <div className="achievements-grid">
                {filtered.map(badge => (
                    <BadgeCard
                        key={badge.id}
                        badge={badge}
                        unlocked={unlockedSet.has(badge.id)}
                        size="lg"
                    />
                ))}
            </div>
        </div>
    )
}
