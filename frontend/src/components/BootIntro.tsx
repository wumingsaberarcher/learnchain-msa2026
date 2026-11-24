import { useEffect, useRef, useState } from 'react'
import LearnChainLogo from './LearnChainLogo'
import { useTranslation } from '../stores/settingsStore'

const SESSION_KEY = 'learnchain-intro-seen'

interface BootIntroProps {
    onFinished: () => void
}

export default function BootIntro({ onFinished }: BootIntroProps) {
    const { t, theme } = useTranslation()
    const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter')
    const doneRef = useRef(false)

    const finish = () => {
        if (doneRef.current) return
        doneRef.current = true
        try {
            sessionStorage.setItem(SESSION_KEY, '1')
        } catch { /* ignore */ }
        onFinished()
    }

    useEffect(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduce) {
            const t0 = window.setTimeout(() => finish(), 200)
            return () => clearTimeout(t0)
        }

        const toHold = window.setTimeout(() => setPhase('hold'), 700)
        const toExit = window.setTimeout(() => setPhase('exit'), 2400)
        const toDone = window.setTimeout(() => finish(), 3200)
        return () => {
            clearTimeout(toHold)
            clearTimeout(toExit)
            clearTimeout(toDone)
        }
        // finish is stable for this mount; avoid re-arming timers
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div
            className={`boot-intro theme-${theme} phase-${phase}`}
            role="dialog"
            aria-label={t('intro.aria')}
            onClick={finish}
        >
            <div className="boot-intro-glow" aria-hidden="true" />
            <div className="boot-intro-ring" aria-hidden="true" />

            <div className="boot-intro-brand">
                <div className="boot-intro-mark">
                    <LearnChainLogo size={88} />
                </div>
                <h1 className="boot-intro-title">LearnChain</h1>
                <p className="boot-intro-tag">{t('dash.tagline')}</p>
            </div>

            <button
                type="button"
                className="boot-intro-skip"
                onClick={e => {
                    e.stopPropagation()
                    finish()
                }}
            >
                {t('intro.skip')}
            </button>
        </div>
    )
}

export function shouldShowBootIntro(): boolean {
    if (typeof window === 'undefined') return false
    try {
        return sessionStorage.getItem(SESSION_KEY) !== '1'
    } catch {
        return true
    }
}
