import { useRef, useState } from 'react'
import {
    Lock,
    Music2,
    Trash2,
    Upload,
    Volume2,
    VolumeX,
} from 'lucide-react'
import { useTranslation } from '../stores/settingsStore'
import {
    BGM_TRACKS,
    MAX_BGM_UPLOAD_MB,
    type BgmTrackId,
    useBgmStore,
} from '../stores/bgmStore'

export default function MusicPage() {
    const { t } = useTranslation()
    const fileRef = useRef<HTMLInputElement>(null)
    const [error, setError] = useState('')
    const [uploading, setUploading] = useState(false)

    const {
        trackId,
        unlocked,
        volume,
        muted,
        isPlaying,
        needsGesture,
        userTracks,
        selectTrack,
        setVolume,
        setMuted,
        addUserTrack,
        removeUserTrack,
        isUnlocked,
        getTrack,
    } = useBgmStore()

    const currentTitle = getTrack(trackId)?.title ?? 'CETA'

    const onPick = (id: BgmTrackId) => {
        if (!isUnlocked(id)) return
        selectTrack(id, true)
    }

    const onUpload = async (file: File | undefined) => {
        if (!file) return
        setError('')
        setUploading(true)
        try {
            await addUserTrack(file)
        } catch (err) {
            const code = err instanceof Error ? err.message : ''
            if (code === 'too_large') setError(t('music.errTooLarge', { mb: MAX_BGM_UPLOAD_MB }))
            else if (code === 'unsupported') setError(t('music.errType'))
            else setError(t('music.errGeneric'))
        } finally {
            setUploading(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    return (
        <div className="music-page">
            <section className="music-card music-now" aria-label={t('music.title')}>
                <div className="music-now-left">
                    <span className={`music-eq${isPlaying ? ' on' : ''}`} aria-hidden>
                        <i /><i /><i />
                    </span>
                    <div>
                        <strong>{currentTitle}</strong>
                        <p>{isPlaying ? t('sidebar.nowPlaying') : needsGesture ? t('sidebar.tapToPlay') : t('sidebar.paused')}</p>
                    </div>
                </div>
                <div className="music-volume">
                    <button
                        type="button"
                        className="music-mute"
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
            </section>

            <section className="music-section">
                <h2>{t('music.builtin')}</h2>
                <p className="music-section-hint">{t('sidebar.bgmHint')}</p>
                <ul className="music-track-list">
                    {BGM_TRACKS.map(track => {
                        const open = unlocked.includes(track.id)
                        const active = trackId === track.id
                        return (
                            <li key={track.id}>
                                <button
                                    type="button"
                                    className={`music-track${active ? ' active' : ''}${open ? '' : ' locked'}`}
                                    onClick={() => onPick(track.id)}
                                    disabled={!open}
                                    title={open ? track.title : t('sidebar.lockedHint')}
                                >
                                    <span className="music-track-main">
                                        {open ? <Music2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                        <span>
                                            <strong>{track.title}</strong>
                                            {!open && <em>{t('sidebar.locked')}</em>}
                                            {open && active && isPlaying && <em>{t('sidebar.nowPlaying')}</em>}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        )
                    })}
                </ul>
            </section>

            <section className="music-section">
                <div className="music-section-head">
                    <div>
                        <h2>{t('music.uploads')}</h2>
                        <p className="music-section-hint">{t('music.uploadHint', { mb: MAX_BGM_UPLOAD_MB })}</p>
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary music-upload-btn"
                        disabled={uploading}
                        onClick={() => fileRef.current?.click()}
                    >
                        <Upload className="w-4 h-4" />
                        {uploading ? t('music.uploading') : t('music.upload')}
                    </button>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="audio/*,.mp3,.aac,.m4a,.wav,.ogg,.flac,.webm"
                        hidden
                        onChange={e => void onUpload(e.target.files?.[0])}
                    />
                </div>

                {error && <p className="music-error">{error}</p>}

                {userTracks.length === 0 ? (
                    <div className="music-empty">
                        <Upload className="w-6 h-6" />
                        <p>{t('music.empty')}</p>
                    </div>
                ) : (
                    <ul className="music-track-list">
                        {userTracks.map(track => {
                            const active = trackId === track.id
                            return (
                                <li key={track.id} className="music-user-row">
                                    <button
                                        type="button"
                                        className={`music-track${active ? ' active' : ''}`}
                                        onClick={() => onPick(track.id)}
                                    >
                                        <span className="music-track-main">
                                            <Music2 className="w-4 h-4" />
                                            <span>
                                                <strong>{track.title}</strong>
                                                {active && isPlaying && <em>{t('sidebar.nowPlaying')}</em>}
                                                <em>{t('music.localOnly')}</em>
                                            </span>
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        className="music-delete"
                                        title={t('music.delete')}
                                        onClick={() => void removeUserTrack(track.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </section>
        </div>
    )
}
