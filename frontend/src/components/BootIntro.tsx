import { useEffect, useRef, useState } from 'react'
import LearnChainLogo from './LearnChainLogo'
import { useTranslation } from '../stores/settingsStore'

const SESSION_KEY = 'learnchain-intro-seen'

interface BootIntroProps {
    onFinished: () => void
}

function wantsCoverPreview(): boolean {
    try {
        const params = new URLSearchParams(window.location.search)
        return params.get('cover') === '1' || params.get('cover') === 'true'
    } catch {
        return false
    }
}

export default function BootIntro({ onFinished }: BootIntroProps) {
    const { t, theme } = useTranslation()
    // Cover/preview mode starts fully opaque so publish screenshots stay sharp
    const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>(() =>
        wantsCoverPreview() ? 'hold' : 'enter',
    )
    const doneRef = useRef(false)

    const finish = () => {
        if (doneRef.current) return
        doneRef.current = true
        setPhase('exit')
        try {
            sessionStorage.setItem(SESSION_KEY, '1')
            // Cover mode is one-shot for the current URL load
            const url = new URL(window.location.href)
            if (url.searchParams.has('cover')) {
                url.searchParams.delete('cover')
                window.history.replaceState({}, '', url.pathname + url.search + url.hash)
            }
        } catch { /* ignore */ }
        window.setTimeout(() => onFinished(), 720)
    }

    useEffect(() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        // Reach a sharp, fully-opaque hold quickly so preview screenshots stay crisp
        const toHold = window.setTimeout(() => setPhase('hold'), reduce ? 0 : 450)
        // Stay on the cover until the user enters — soft fallback for kiosks only
        const softEnter = window.setTimeout(() => finish(), 22000)
        return () => {
            clearTimeout(toHold)
            clearTimeout(softEnter)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div
            className={`boot-intro theme-${theme} phase-${phase}`}
            role="dialog"
            aria-modal="true"
            aria-label={t('intro.aria')}
        >
            <div className="boot-intro-sky" aria-hidden="true" />
            <div className="boot-intro-grid" aria-hidden="true" />
            <div className="boot-intro-glow" aria-hidden="true" />
            <div className="boot-intro-beam" aria-hidden="true" />

            <div className="boot-intro-stage">
                <div className="boot-intro-copy">
                    <p className="boot-intro-kicker">{t('intro.kicker')}</p>
                    <div className="boot-intro-brand-row">
                        <div className="boot-intro-mark">
                            <LearnChainLogo size={72} />
                        </div>
                        <h1 className="boot-intro-title">LearnChain</h1>
                    </div>
                    <p className="boot-intro-headline">{t('dash.heroHeadline')}</p>
                    <p className="boot-intro-tag">{t('dash.tagline')}</p>

                    <div className="boot-intro-actions">
                        <button type="button" className="boot-intro-enter" onClick={finish}>
                            {t('intro.enter')}
                        </button>
                        <button type="button" className="boot-intro-skip" onClick={finish}>
                            {t('intro.skip')}
                        </button>
                    </div>
                </div>

                <div className="boot-intro-visual" aria-hidden="true">
                    <div className="boot-intro-orbit" />
                    <div className="boot-intro-orbit boot-intro-orbit-inner" />
                    <div className="boot-intro-chain">
                        <span className="boot-link boot-link-a" />
                        <span className="boot-link boot-link-b" />
                        <span className="boot-link boot-link-c" />
                        <span className="boot-link-node" />
                    </div>
                    <div className="boot-intro-mark-xl">
                        <LearnChainLogo size={200} />
                    </div>
                </div>
            </div>
        </div>
    )
}

export function shouldShowBootIntro(): boolean {
    if (typeof window === 'undefined') return false
    try {
        const params = new URLSearchParams(window.location.search)
        if (params.get('cover') === '1' || params.get('cover') === 'true') {
            sessionStorage.removeItem(SESSION_KEY)
            return true
        }
        return sessionStorage.getItem(SESSION_KEY) !== '1'
    } catch {
        return true
    }
}
