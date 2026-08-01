/** Animated bars driven by mic RMS (0–1). */
export default function VoiceVolumeIcon({
    level,
    className = 'w-4 h-4',
}: {
    level: number
    className?: string
}) {
    const clamped = Math.max(0, Math.min(1, level))
    // Keep a quiet baseline so the icon still “breathes” while listening
    const bars = [0.28, 0.55, 0.9, 0.55, 0.28].map((weight, i) => {
        const wave = 0.18 + clamped * weight + (i === 2 ? clamped * 0.15 : 0)
        return Math.min(1, wave)
    })

    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
        >
            {bars.map((h, i) => {
                const barH = 4 + h * 14
                const x = 3 + i * 4.2
                const y = (24 - barH) / 2
                return (
                    <rect
                        key={i}
                        x={x}
                        y={y}
                        width="2.6"
                        height={barH}
                        rx="1.2"
                        style={{
                            transition: 'height 60ms linear, y 60ms linear',
                        }}
                    />
                )
            })}
        </svg>
    )
}
