import { useEffect, useState } from 'react'
import {
    CheckCircle2,
    Flame,
    Lock,
    Music2,
    Timer,
    Volume2,
    VolumeX,
} from 'lucide-react'
import { createCheckIn } from '../api/checkInApi'
import { BGM_TRACKS, type BgmTrackId, useBgmStore } from '../stores/bgmStore'
import { focusBonusXp, useFocusModeStore } from '../stores/focusModeStore'
import { useChatStore } from '../stores/chatStore'
import { useTranslation } from '../stores/settingsStore'
import { difficultyKey } from '../utils/habitHelpers'
import { pickCompanionLine, randomFocusEmotion } from '../companions/companionLines'
import type { Emotion } from './character/emotionAssets'
import CompanionPeek from './character/CompanionPeek'

const ESTIMATE_PRESETS = [15, 25, 45, 60]
const BONUS_MIN_SECONDS = 60
const FOCUS_PEEK_FIRST_MS = 28_000
const FOCUS_PEEK_SHOW_MIN = 7_000
const FOCUS_PEEK_SHOW_MAX = 14_000
const FOCUS_PEEK_HIDE_MIN = 18_000
const FOCUS_PEEK_HIDE_MAX = 40_000

function formatElapsed(totalSeconds: number): string {
    const h = Math.floor(totalSeconds / 3600)
    const m = Math.floor((totalSeconds % 3600) / 60)
    const s = totalSeconds % 60
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export interface FocusCheckInResult {
    habitId: number
    xpEarned: number
    baseXp?: number
    focusBonusXp?: number
    newlyUnlocked?: string[]
}

interface FocusModeOverlayProps {
    onCompleted: (result: FocusCheckInResult) => void
}

export default function FocusModeOverlay({ onCompleted }: FocusModeOverlayProps) {
    const { t, language } = useTranslation()
    const {
        isActive,
        phase,
        target,
        estimatedMinutes,
        startedAt,
        elapsedSeconds,
        setEstimatedMinutes,
        beginSession,
        setElapsedSeconds,
        endSession,
    } = useFocusModeStore()

    const {
        trackId,
        volume,
        muted,
        isPlaying,
        needsGesture,
        selectTrack,
        setVolume,
        setMuted,
        userTracks,
        isUnlocked,
    } = useBgmStore()

    const appendCompanionAside = useChatStore(s => s.appendCompanionAside)

    const playableTracks = [...BGM_TRACKS, ...userTracks]

    const [customMinutes, setCustomMinutes] = useState('')
    const [checkingIn, setCheckingIn] = useState(false)
    const [error, setError] = useState('')
    const [peekVisible, setPeekVisible] = useState(false)
    const [peekLine, setPeekLine] = useState('')
    const [peekEmotion, setPeekEmotion] = useState<Emotion>('normal')

    useEffect(() => {
        if (!isActive || phase !== 'running' || !startedAt) return
        const tick = () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
        tick()
        const id = window.setInterval(tick, 1000)
        return () => window.clearInterval(id)
    }, [isActive, phase, startedAt, setElapsedSeconds])

    useEffect(() => {
        if (!isActive || phase !== 'running') return
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', onBeforeUnload)
        return () => window.removeEventListener('beforeunload', onBeforeUnload)
    }, [isActive, phase])

    useEffect(() => {
        if (!isActive || phase !== 'running') {
            setPeekVisible(false)
            setPeekLine('')
            return
        }

        const lang = language.startsWith('zh') ? 'zh' : 'en'
        const timers: number[] = []
        let cancelled = false

        const hideThenSchedule = () => {
            if (cancelled) return
            setPeekVisible(false)
            const hideFor = FOCUS_PEEK_HIDE_MIN + Math.random() * (FOCUS_PEEK_HIDE_MAX - FOCUS_PEEK_HIDE_MIN)
            timers.push(window.setTimeout(showPeek, hideFor))
        }

        const showPeek = () => {
            if (cancelled) return
            const emotion = randomFocusEmotion()
            const line = pickCompanionLine('focus', lang)
            setPeekEmotion(emotion)
            setPeekLine(line)
            setPeekVisible(true)
            appendCompanionAside(line, 'focus', emotion)
            const showFor = FOCUS_PEEK_SHOW_MIN + Math.random() * (FOCUS_PEEK_SHOW_MAX - FOCUS_PEEK_SHOW_MIN)
            timers.push(window.setTimeout(hideThenSchedule, showFor))
        }

        timers.push(window.setTimeout(showPeek, FOCUS_PEEK_FIRST_MS))

        return () => {
            cancelled = true
            timers.forEach(clearTimeout)
        }
    }, [isActive, phase, language, appendCompanionAside])

    if (!isActive || !target) return null

    const bonus = focusBonusXp(target.difficulty)
    const estimateSeconds = estimatedMinutes * 60
    const progress = Math.min(1, elapsedSeconds / Math.max(1, estimateSeconds))
    const nearEstimate = elapsedSeconds >= estimateSeconds * 0.8
    const bonusReady = elapsedSeconds >= BONUS_MIN_SECONDS
    const label = target.milestoneTitle
        ? `${target.habitName} · ${target.milestoneTitle}`
        : target.habitName

    const onPickTrack = (id: BgmTrackId) => {
        if (!isUnlocked(id)) return
        selectTrack(id, true)
    }

    const handleStart = () => {
        setError('')
        beginSession()
    }

    const handleAbandon = () => {
        if (!window.confirm(t('focus.abandonConfirm'))) return
        endSession()
    }

    const handleCheckIn = async () => {
        if (checkingIn) return
        setCheckingIn(true)
        setError('')
        try {
            const result = await createCheckIn({
                habitId: target.habitId,
                milestoneId: target.milestoneId,
                fromFocusMode: true,
                focusSeconds: elapsedSeconds,
                estimatedMinutes,
            })
            const payload: FocusCheckInResult = {
                habitId: target.habitId,
                xpEarned: result.xpEarned,
                baseXp: result.baseXp,
                focusBonusXp: result.focusBonusXp,
                newlyUnlocked: result.newlyUnlocked,
            }
            endSession()
            onCompleted(payload)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : t('focus.checkinFailed')
            setError(message)
        } finally {
            setCheckingIn(false)
        }
    }

    return (
        <div className="focus-mode-overlay" role="dialog" aria-modal="true" aria-label={t('focus.title')}>
            <div className="focus-mode-atmosphere" aria-hidden />
            <div className="focus-mode-panel">
                <div className="focus-mode-eyebrow">
                    <Flame className="w-4 h-4" />
                    {t('focus.eyebrow')}
                </div>
                <h2 className="focus-mode-title">{label}</h2>
                <p className="focus-mode-meta">
                    {t(difficultyKey(target.difficulty))} · {t('focus.baseXp', { xp: String(target.baseXP) })}
                    {' · '}
                    {t('focus.bonusHint', { xp: String(bonus) })}
                </p>

                {phase === 'setup' ? (
                    <div className="focus-mode-setup">
                        <p className="focus-mode-setup-label">{t('focus.estimateLabel')}</p>
                        <div className="focus-mode-presets">
                            {ESTIMATE_PRESETS.map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    className={`focus-preset${estimatedMinutes === m ? ' active' : ''}`}
                                    onClick={() => {
                                        setEstimatedMinutes(m)
                                        setCustomMinutes('')
                                    }}
                                >
                                    {m} {t('focus.minutes')}
                                </button>
                            ))}
                        </div>
                        <div className="focus-mode-custom">
                            <label htmlFor="focus-custom-min">{t('focus.customEstimate')}</label>
                            <input
                                id="focus-custom-min"
                                type="number"
                                min={1}
                                max={240}
                                value={customMinutes}
                                placeholder={String(estimatedMinutes)}
                                onChange={e => {
                                    setCustomMinutes(e.target.value)
                                    const n = Number(e.target.value)
                                    if (Number.isFinite(n) && n >= 1) setEstimatedMinutes(n)
                                }}
                            />
                        </div>
                        <button type="button" className="focus-mode-start" onClick={handleStart}>
                            <Timer className="w-5 h-5" />
                            {t('focus.start')}
                        </button>
                        <button type="button" className="focus-mode-cancel" onClick={endSession}>
                            {t('focus.cancel')}
                        </button>
                    </div>
                ) : (
                    <div className="focus-mode-running">
                        <div className="focus-mode-timer" aria-live="polite">
                            {formatElapsed(elapsedSeconds)}
                        </div>
                        <p className="focus-mode-estimate-line">
                            {t('focus.estimated', { minutes: String(estimatedMinutes) })}
                            {nearEstimate ? ` · ${t('focus.nearDone')}` : ''}
                        </p>
                        <div className="focus-mode-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                            <div className="focus-mode-progress-fill" style={{ width: `${progress * 100}%` }} />
                        </div>
                        <p className={`focus-mode-bonus-status${bonusReady ? ' ready' : ''}`}>
                            {bonusReady
                                ? t('focus.bonusReady', { xp: String(bonus) })
                                : t('focus.bonusWait', { seconds: String(Math.max(0, BONUS_MIN_SECONDS - elapsedSeconds)) })}
                        </p>

                        <button
                            type="button"
                            className={`focus-mode-checkin${nearEstimate ? ' glow' : ''}`}
                            onClick={() => void handleCheckIn()}
                            disabled={checkingIn}
                        >
                            <CheckCircle2 className="w-6 h-6" />
                            {checkingIn ? t('habits.checking') : t('focus.checkin')}
                        </button>

                        {error && <p className="focus-mode-error">{error}</p>}

                        <button type="button" className="focus-mode-abandon" onClick={handleAbandon}>
                            {t('focus.abandon')}
                        </button>
                    </div>
                )}

                <div className="focus-mode-bgm">
                    <div className="focus-mode-bgm-head">
                        <Music2 className="w-4 h-4" />
                        <span>{t('focus.bgm')}</span>
                        {isPlaying && <span className="focus-mode-bgm-live">{t('focus.bgmPlaying')}</span>}
                    </div>
                    {needsGesture && <p className="focus-mode-bgm-hint">{t('sidebar.tapToPlay')}</p>}
                    <ul className="focus-mode-tracks">
                        {playableTracks.map(track => {
                            const open = isUnlocked(track.id)
                            const active = trackId === track.id
                            return (
                                <li key={track.id}>
                                    <button
                                        type="button"
                                        className={`focus-track-btn${active ? ' active' : ''}${open ? '' : ' locked'}`}
                                        disabled={!open}
                                        title={open ? track.title : t('sidebar.lockedHint')}
                                        onClick={() => onPickTrack(track.id)}
                                    >
                                        {open ? <Music2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                                        <span>{track.title}</span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                    <div className="focus-mode-volume">
                        <button
                            type="button"
                            className="focus-mute-btn"
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

            {phase === 'running' && (
                <div className="focus-mode-peek-layer">
                    <CompanionPeek
                        visible={peekVisible}
                        emotion={peekEmotion}
                        isTalking={peekVisible}
                        line={peekLine}
                        mood="focus"
                        side="bottom"
                    />
                </div>
            )}
        </div>
    )
}
