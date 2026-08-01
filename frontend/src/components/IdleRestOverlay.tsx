import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Pencil, X } from 'lucide-react'
import { t as translate } from '../i18n/translations'
import { pickCompanionLine, randomIdleEmotion } from '../companions/companionLines'
import type { Emotion } from './character/emotionAssets'
import CompanionPeek from './character/CompanionPeek'
import { IDLE_REST_MS, useIdleRestStore } from '../stores/idleRestStore'
import { useChatStore } from '../stores/chatStore'

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
    'mousemove',
    'mousedown',
    'keydown',
    'touchstart',
    'scroll',
    'wheel',
    'pointerdown',
]

/** First peek after entering rest. */
const PEEK_FIRST_MS = 16_000
/** Later peeks while still resting. */
const PEEK_GAP_MIN_MS = 22_000
const PEEK_GAP_MAX_MS = 38_000
const PEEK_VISIBLE_MS = 9_000

interface IdleRestOverlayProps {
    pauseIdle?: boolean
}

export default function IdleRestOverlay({ pauseIdle = false }: IdleRestOverlayProps) {
    const {
        isResting,
        frozenTheme,
        frozenLanguage,
        sessionTitle,
        sessionQuote,
        customSlogans,
        enterRest,
        leaveRest,
        setCustomSlogans,
    } = useIdleRestStore()

    const appendCompanionAside = useChatStore(s => s.appendCompanionAside)

    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const [peekVisible, setPeekVisible] = useState(false)
    const [peekLine, setPeekLine] = useState('')
    const [peekEmotion, setPeekEmotion] = useState<Emotion>('sorrow')
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const peekTimers = useRef<Array<ReturnType<typeof setTimeout>>>([])

    const clearPeekTimers = () => {
        peekTimers.current.forEach(id => clearTimeout(id))
        peekTimers.current = []
    }

    useEffect(() => {
        if (isResting || pauseIdle) {
            if (timerRef.current) {
                clearTimeout(timerRef.current)
                timerRef.current = null
            }
            return
        }

        const arm = () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            timerRef.current = setTimeout(() => enterRest(), IDLE_REST_MS)
        }

        arm()
        ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, arm, { passive: true }))
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, arm))
        }
    }, [isResting, pauseIdle, enterRest])

    useEffect(() => {
        if (!isResting) {
            setEditing(false)
            setPeekVisible(false)
            setPeekLine('')
            clearPeekTimers()
            return
        }

        const lang = frozenLanguage.startsWith('zh') ? 'zh' : 'en'
        let cancelled = false

        const showPeek = () => {
            if (cancelled) return
            const emotion = randomIdleEmotion()
            const line = pickCompanionLine('idle', lang)
            setPeekEmotion(emotion)
            setPeekLine(line)
            setPeekVisible(true)
            appendCompanionAside(line, 'idle', emotion)

            const hide = setTimeout(() => {
                if (cancelled) return
                setPeekVisible(false)
                const gap = PEEK_GAP_MIN_MS + Math.random() * (PEEK_GAP_MAX_MS - PEEK_GAP_MIN_MS)
                const next = setTimeout(showPeek, gap)
                peekTimers.current.push(next)
            }, PEEK_VISIBLE_MS)
            peekTimers.current.push(hide)
        }

        const first = setTimeout(showPeek, PEEK_FIRST_MS)
        peekTimers.current.push(first)

        return () => {
            cancelled = true
            clearPeekTimers()
        }
    }, [isResting, frozenLanguage, appendCompanionAside])

    if (!isResting) return null

    const tt = (key: Parameters<typeof translate>[0]) => translate(key, frozenLanguage)

    const openEditor = () => {
        setDraft(customSlogans.join('\n'))
        setEditing(true)
    }

    const saveEditor = () => {
        setCustomSlogans(draft.split('\n'))
        setEditing(false)
    }

    const wake = () => {
        if (editing) return
        leaveRest()
    }

    return (
        <div
            className={`idle-rest-overlay theme-${frozenTheme}`}
            role="dialog"
            aria-modal="true"
            aria-label={tt('rest.title')}
            onClick={wake}
        >
            <div
                className="idle-rest-card"
                onClick={e => e.stopPropagation()}
            >
                <button
                    type="button"
                    className="idle-rest-close"
                    onClick={leaveRest}
                    aria-label={tt('rest.wake')}
                >
                    <X className="w-5 h-5" />
                </button>

                <p className="idle-rest-eyebrow">{tt('rest.eyebrow')}</p>
                <h2 className="idle-rest-title">{sessionTitle}</h2>
                <p className="idle-rest-quote">「{sessionQuote}」</p>

                <p className="idle-rest-hint">{tt('rest.editHint')}</p>

                {editing ? (
                    <div className="idle-rest-editor">
                        <textarea
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            rows={5}
                            placeholder={tt('rest.editPlaceholder')}
                            aria-label={tt('rest.editLabel')}
                        />
                        <div className="idle-rest-editor-actions">
                            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                                {tt('rest.cancel')}
                            </button>
                            <button type="button" className="btn btn-primary" onClick={saveEditor}>
                                {tt('rest.save')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="idle-rest-actions">
                        <button type="button" className="idle-rest-edit-btn" onClick={openEditor}>
                            <Pencil className="w-4 h-4" />
                            {tt('rest.edit')}
                        </button>
                        <Link
                            to="/habits"
                            className="btn btn-primary idle-rest-cta"
                            onClick={leaveRest}
                        >
                            {tt('dash.goCheckin')} <ArrowRight className="inline w-5 h-5 ml-1" />
                        </Link>
                        <button type="button" className="idle-rest-wake-link" onClick={leaveRest}>
                            {tt('rest.wake')}
                        </button>
                    </div>
                )}
            </div>

            <div className="idle-rest-peek-layer" onClick={e => e.stopPropagation()}>
                <CompanionPeek
                    visible={peekVisible}
                    emotion={peekEmotion}
                    isTalking={peekVisible}
                    line={peekLine}
                    mood="lazy"
                    side="right"
                />
            </div>
        </div>
    )
}
