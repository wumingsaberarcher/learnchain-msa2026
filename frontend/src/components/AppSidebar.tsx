import { Link } from 'react-router-dom'
import {
    Info,
    Lock,
    Menu,
    Music2,
    X,
} from 'lucide-react'
import { useTranslation } from '../stores/settingsStore'
import { useBgmStore } from '../stores/bgmStore'

export default function AppSidebar() {
    const { t } = useTranslation()
    const { sidebarOpen, setSidebarOpen, isPlaying, trackId, getTrack } = useBgmStore()

    if (!sidebarOpen) return null

    const close = () => setSidebarOpen(false)
    const current = getTrack(trackId)

    return (
        <>
            <button
                type="button"
                className="app-sidebar-backdrop"
                aria-label={t('sidebar.close')}
                onClick={close}
            />
            <aside className="app-sidebar" role="dialog" aria-label={t('sidebar.title')}>
                <div className="app-sidebar-glow" aria-hidden />

                <div className="app-sidebar-header">
                    <div className="app-sidebar-title">
                        <span className="app-sidebar-title-icon">
                            <Menu className="w-4 h-4" />
                        </span>
                        <div>
                            <strong>{t('sidebar.title')}</strong>
                            <p>{t('sidebar.menuHint')}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="app-sidebar-close"
                        onClick={close}
                        aria-label={t('sidebar.close')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <nav className="app-sidebar-nav" aria-label={t('sidebar.title')}>
                    <Link to="/music" className="app-sidebar-nav-card" onClick={close}>
                        <span className="app-sidebar-nav-icon music">
                            <Music2 className="w-5 h-5" />
                        </span>
                        <span className="app-sidebar-nav-copy">
                            <strong>{t('sidebar.navMusic')}</strong>
                            <em>{t('sidebar.navMusicHint')}</em>
                        </span>
                    </Link>
                    <Link to="/about" className="app-sidebar-nav-card" onClick={close}>
                        <span className="app-sidebar-nav-icon about">
                            <Info className="w-5 h-5" />
                        </span>
                        <span className="app-sidebar-nav-copy">
                            <strong>{t('sidebar.navAbout')}</strong>
                            <em>{t('sidebar.navAboutHint')}</em>
                        </span>
                    </Link>
                </nav>

                <div className="app-sidebar-now">
                    <div className="app-sidebar-now-label">
                        {isPlaying ? t('sidebar.nowPlaying') : t('sidebar.paused')}
                    </div>
                    <div className="app-sidebar-now-track">
                        <Music2 className="w-4 h-4" />
                        <span>{current?.title ?? 'CETA'}</span>
                    </div>
                    <p className="app-sidebar-now-hint">{t('sidebar.goMusicHint')}</p>
                </div>

                <p className="app-sidebar-foot">
                    <Lock className="w-3.5 h-3.5" />
                    {t('sidebar.lockedHint')}
                </p>
            </aside>
        </>
    )
}
