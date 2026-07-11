import { useCallback, useRef } from 'react'
import { useSettingsStore, type Corner } from '../stores/settingsStore'
import { Moon, Sun } from 'lucide-react'

const CORNERS: { id: Corner; lang: string; Icon: typeof Sun }[] = [
    { id: 'tl', lang: '中', Icon: Sun },
    { id: 'tr', lang: 'EN', Icon: Sun },
    { id: 'bl', lang: '中', Icon: Moon },
    { id: 'br', lang: 'EN', Icon: Moon },
]

const THUMB_POS: Record<Corner, { top: string; left: string }> = {
    tl: { top: '8%', left: '8%' },
    tr: { top: '8%', left: '72%' },
    bl: { top: '72%', left: '8%' },
    br: { top: '72%', left: '72%' },
}

export default function ThemeLocaleToggle() {
    const corner = useSettingsStore(s => s.corner)
    const setCorner = useSettingsStore(s => s.setCorner)
    const boxRef = useRef<HTMLDivElement>(null)

    const pickCorner = useCallback((clientX: number, clientY: number) => {
        const box = boxRef.current
        if (!box) return
        const rect = box.getBoundingClientRect()
        const x = clientX - rect.left
        const y = clientY - rect.top
        const isLeft = x < rect.width / 2
        const isTop = y < rect.height / 2

        let next: Corner
        if (isTop && isLeft) next = 'tl'
        else if (isTop && !isLeft) next = 'tr'
        else if (!isTop && isLeft) next = 'bl'
        else next = 'br'

        setCorner(next)
    }, [setCorner])

    const handleClick = (e: React.MouseEvent) => {
        pickCorner(e.clientX, e.clientY)
    }

    const pos = THUMB_POS[corner]

    return (
        <div
            ref={boxRef}
            className="theme-locale-toggle"
            onClick={handleClick}
            role="group"
            aria-label="Theme and language switcher"
        >
            {CORNERS.map(({ id, lang, Icon }) => (
                <div key={id} className={`corner-label corner-${id}${corner === id ? ' active' : ''}`}>
                    <Icon className="corner-icon" />
                    <span>{lang}</span>
                </div>
            ))}
            <div className="corner-grid-lines" aria-hidden="true" />
            <div
                className="corner-thumb"
                style={{ top: pos.top, left: pos.left }}
                aria-hidden="true"
            />
        </div>
    )
}
