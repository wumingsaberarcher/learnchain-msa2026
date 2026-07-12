import { useAchievementStore } from '../stores/achievementStore'
import { BADGE_MAP } from '../badges/badgeDefinitions'
import { useTranslation } from '../stores/settingsStore'
import { Sparkles, X } from 'lucide-react'

export default function BadgeUnlockModal() {
    const { pendingUnlocks, dismissUnlock } = useAchievementStore()
    const { t } = useTranslation()

    if (!pendingUnlocks.length) return null

    const badgeId = pendingUnlocks[0]
    const badge = BADGE_MAP[badgeId]
    if (!badge) {
        dismissUnlock(badgeId)
        return null
    }

    return (
        <div className="badge-unlock-overlay" onClick={() => dismissUnlock(badgeId)}>
            <div className="badge-unlock-modal" onClick={e => e.stopPropagation()}>
                <button type="button" className="badge-unlock-close" onClick={() => dismissUnlock(badgeId)}>
                    <X className="w-4 h-4" />
                </button>
                <div className="badge-unlock-sparkle"><Sparkles className="w-8 h-8" /></div>
                <h3 className="badge-unlock-title">{t('badge.unlocked')}</h3>
                <div className="badge-unlock-image-wrap">
                    {badge.image && <img src={badge.image} alt={t(badge.titleKey)} className="badge-unlock-image" />}
                </div>
                <h4 className="badge-unlock-name">{t(badge.titleKey)}</h4>
                <p className="badge-unlock-desc">{t(badge.descKey)}</p>
                <button type="button" className="btn btn-primary" onClick={() => dismissUnlock(badgeId)}>
                    {t('badge.awesome')}
                </button>
                {pendingUnlocks.length > 1 && (
                    <p className="badge-unlock-more">{t('badge.moreCount', { count: pendingUnlocks.length - 1 })}</p>
                )}
            </div>
        </div>
    )
}
