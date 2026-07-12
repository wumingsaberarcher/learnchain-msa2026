import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, User, Award, LogOut } from 'lucide-react'
import { useHabitStore } from '../stores/habitStore'
import { useAchievementStore } from '../stores/achievementStore'
import { useTranslation } from '../stores/settingsStore'
import { BADGE_DEFINITIONS } from '../badges/badgeDefinitions'
import BadgeCard from './BadgeCard'

export default function UserProfileMenu() {
    const { currentUser, logout } = useHabitStore()
    const { profile, achievements, fetchProfile } = useAchievementStore()
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (currentUser) fetchProfile()
    }, [currentUser, fetchProfile])

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [])

    if (!currentUser) return null

    const unlockedCount = achievements.filter(a => a.unlocked).length
    const previewBadges = BADGE_DEFINITIONS.slice(0, 4).map(def => {
        const rec = achievements.find(a => a.badgeId === def.id)
        return { def, unlocked: rec?.unlocked ?? false }
    })

    const joinDate = profile?.createdAt
        ? new Date(profile.createdAt).toLocaleDateString()
        : '—'

    return (
        <div className="user-profile-menu" ref={ref}>
            <button
                type="button"
                className="user-profile-trigger"
                onClick={() => setOpen(v => !v)}
                aria-expanded={open}
            >
                <span className="user-profile-avatar">{currentUser.username.charAt(0).toUpperCase()}</span>
                <span className="nav-username">{currentUser.username}</span>
                <ChevronDown className={`w-4 h-4 user-profile-chevron${open ? ' open' : ''}`} />
            </button>

            {open && (
                <div className="user-profile-panel">
                    <div className="user-profile-panel-header">
                        <div className="user-profile-panel-avatar">{currentUser.username.charAt(0).toUpperCase()}</div>
                        <div>
                            <div className="user-profile-panel-name">{currentUser.username}</div>
                            <div className="user-profile-panel-meta">Lv.{currentUser.level} · {currentUser.totalXP} XP</div>
                        </div>
                    </div>

                    <div className="user-profile-panel-info">
                        <div><span>{t('profile.email')}</span><strong>{profile?.email ?? '—'}</strong></div>
                        <div><span>{t('profile.joined')}</span><strong>{joinDate}</strong></div>
                    </div>

                    {profile?.bio && (
                        <p className="user-profile-bio-preview">{profile.bio.split('\n')[0]}</p>
                    )}

                    <Link to="/profile" className="user-profile-link" onClick={() => setOpen(false)}>
                        <User className="w-4 h-4" /> {t('profile.edit')}
                    </Link>

                    <div className="user-profile-achievements-preview">
                        <div className="user-profile-section-title">
                            <Award className="w-4 h-4" />
                            {t('profile.achievements')} ({unlockedCount}/{BADGE_DEFINITIONS.length})
                        </div>
                        <div className="user-profile-badge-row">
                            {previewBadges.map(({ def, unlocked }) => (
                                <BadgeCard key={def.id} badge={def} unlocked={unlocked} size="sm" />
                            ))}
                        </div>
                        <Link to="/achievements" className="user-profile-link" onClick={() => setOpen(false)}>
                            {t('profile.viewAllBadges')}
                        </Link>
                    </div>

                    <button type="button" className="btn-nav-logout user-profile-logout" onClick={logout}>
                        <LogOut className="w-4 h-4" /> {t('nav.logout')}
                    </button>
                </div>
            )}
        </div>
    )
}
