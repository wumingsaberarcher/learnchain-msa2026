import { useMemo } from 'react'
import { useAchievementStore } from '../stores/achievementStore'
import { useTranslation } from '../stores/settingsStore'

function dailySeed(): number {
    const d = new Date()
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function pickDailyQuote(lines: string[]): string {
    if (!lines.length) return ''
    const seed = dailySeed()
    return lines[seed % lines.length]
}

interface MotivationTickerProps {
    fallback: string
}

export default function MotivationTicker({ fallback }: MotivationTickerProps) {
    const { profile } = useAchievementStore()
    const { t } = useTranslation()

    const quotes = useMemo(() => {
        const personal = (profile?.bio ?? '')
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean)
        const defaults = [
            t('dash.persistSub'),
            t('motivation.default1'),
            t('motivation.default2'),
            t('motivation.default3'),
        ]
        return personal.length ? personal : defaults
    }, [profile?.bio, t])

    const dailyQuote = useMemo(() => pickDailyQuote(quotes), [quotes])
    const tickerItems = useMemo(() => {
        const rotated = [...quotes]
        const idx = quotes.indexOf(dailyQuote)
        if (idx > 0) rotated.push(...rotated.splice(0, idx))
        return [...rotated, ...rotated]
    }, [quotes, dailyQuote])

    return (
        <div className="motivation-ticker-wrap">
            <p className="motivation-daily-quote">「{dailyQuote || fallback}」</p>
            <div className="motivation-ticker-track">
                <div className="motivation-ticker-inner">
                    {tickerItems.map((q, i) => (
                        <span key={`${i}-${q.slice(0, 12)}`} className="motivation-ticker-item">{q}</span>
                    ))}
                </div>
            </div>
        </div>
    )
}
