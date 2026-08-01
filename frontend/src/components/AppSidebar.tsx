import { Link, useLocation } from 'react-router-dom'
import { Info, Lock, Menu, Music2, Volume2, VolumeX, X } from 'lucide-react'
import { useTranslation } from '../stores/settingsStore'
import { BGM_TRACKS, type BgmTrackId, useBgmStore } from '../stores/bgmStore'

export default function AppSidebar() {
    const { t } = useTranslation()
    const location = useLocation()
    const {
        sidebarOpen,
        setSidebarOpen,
        trackId,
        unlocked,
        volume,
        muted,
        isPlaying,
        needsGesture,
        selectTrack,
        setVolume,
        setMuted,
    } = useBgmStore()

    if (!sidebarOpen) return null

    const onPick = (id: BgmTrackId) => {
        if (!unlocked.includes(id)) return
        selectTrack(id, true)
    }

    const close = () => setSidebarOpen(false)

    return (
        <>
            <button
                type="button"
                className="app-sidebar-backdrop"
                aria-label={t('sidebar.close')}
                onClick={close}
            />
            <aside className="app-sidebar" role="dialog" aria-label={t('sidebar.title')}>
                <div className="app-sidebar-header">
                    <div className="app-sidebar-title">
                        <Menu className="w-5 h-5" />
                        <span>{t('sidebar.title')}</span>
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
                    <a href="#sidebar-music" className="app-sidebar-nav-item active">
                        <Music2 className="w-4 h-4" />
                        <span>{t('sidebar.navMusic')}</span>
                    </a>
                    <Link
                        to="/about"
                        className={`app-sidebar-nav-item${location.pathname === '/about' ? ' current' : ''}`}
                        onClick={close}
                    >
                        <Info className="w-4 h-4" />
                        <span>{t('sidebar.navAbout')}</span>
                    </Link>
                </nav>

                <div id="sidebar-music" className="app-sidebar-music">
                    <p className="app-sidebar-hint">{t('sidebar.bgmHint')}</p>
                    {needsGesture && (
                        <p className="app-sidebar-gesture">{t('sidebar.tapToPlay')}</p>
                    )}

                    <div className="app-sidebar-section">
                        <h3>{t('sidebar.bgm')}</h3>
                        <ul className="bgm-track-list">
                            {BGM_TRACKS.map(track => {
                                const open = unlocked.includes(track.id)
                                const active = trackId === track.id
                                return (
                                    <li key={track.id}>
                                        <button
                                            type="button"
                                            className={`bgm-track-btn${active ? ' active' : ''}${open ? '' : ' locked'}`}
                                            onClick={() => onPick(track.id)}
                                            disabled={!open}
                                            title={open ? track.title : t('sidebar.lockedHint')}
                                        >
                                            <span className="bgm-track-main">
                                                {open ? (
                                                    <Music2 className="w-4 h-4" />
                                                ) : (
                                                    <Lock className="w-4 h-4" />
                                                )}
                                                <span>
                                                    <strong>{track.title}</strong>
                                                    {!open && (
                                                        <em>{t('sidebar.locked')}</em>
                                                    )}
                                                    {open && active && isPlaying && (
                                                        <em>{t('sidebar.nowPlaying')}</em>
                                                    )}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>

                    <div className="app-sidebar-section">
                        <h3>{t('sidebar.volume')}</h3>
                        <div className="bgm-volume-row">
                            <button
                                type="button"
                                className="bgm-mute-btn"
                                onClick={() => setMuted(!muted)}
                                aria-label={muted ? t('sidebar.unmute') : t('sidebar.mute')}
                            >
                                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            </button>
                            <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={volume}
                                onChange={e => setVolume(Number(e.target.value))}
                                aria-label={t('sidebar.volume')}
                            />
                        </div>
                    </div>
                </div>
            </aside>
        </>
    )
}
