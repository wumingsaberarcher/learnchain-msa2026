import { BADGE_MAP, type BadgeDefinition } from '../badges/badgeDefinitions'
import { useTranslation } from '../stores/settingsStore'

interface BadgeCardProps {
    badge: BadgeDefinition
    unlocked: boolean
    size?: 'sm' | 'md' | 'lg'
    onClick?: () => void
}

export default function BadgeCard({ badge, unlocked, size = 'md', onClick }: BadgeCardProps) {
    const { t } = useTranslation()

    return (
        <div
            className={`badge-card badge-card-${size}${unlocked ? ' unlocked' : ' locked'}`}
            title={t(badge.titleKey)}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
        >
            <div className="badge-card-image-wrap">
                {badge.image ? (
                    <img src={badge.image} alt={t(badge.titleKey)} className="badge-card-image" />
                ) : (
                    <div className="badge-card-placeholder">?</div>
                )}
                {!unlocked && <div className="badge-card-lock-overlay" />}
            </div>
            {size !== 'sm' && (
                <div className="badge-card-label">
                    <span className="badge-card-title">{t(badge.titleKey)}</span>
                    <span className="badge-card-desc">{t(badge.descKey)}</span>
                </div>
            )}
        </div>
    )
}

export function getBadgeTitle(badgeId: string, t: (k: keyof typeof import('../i18n/translations').zh) => string) {
    const badge = BADGE_MAP[badgeId]
    return badge ? t(badge.titleKey) : badgeId
}
