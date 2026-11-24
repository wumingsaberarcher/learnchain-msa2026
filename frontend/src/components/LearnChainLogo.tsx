/**
 * LearnChain mark — three ascending interlocking chain links.
 * Motif: habit streaks linked into a growth path (学习链).
 */
interface LearnChainLogoProps {
    className?: string
    size?: number
    /** Prefer mark-only in tight UI; wordmark is separate text */
    title?: string
}

export default function LearnChainLogo({ className = '', size = 40, title = 'LearnChain' }: LearnChainLogoProps) {
    const id = `lc-${size}`
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label={title}
        >
            <defs>
                <linearGradient id={`${id}-g`} x1="8" y1="56" x2="56" y2="8" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#00E8FF" />
                    <stop offset="0.55" stopColor="#5B8CFF" />
                    <stop offset="1" stopColor="#FF4FD8" />
                </linearGradient>
                <linearGradient id={`${id}-core`} x1="20" y1="44" x2="44" y2="20" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#00FFC6" />
                    <stop offset="1" stopColor="#00E8FF" />
                </linearGradient>
            </defs>
            {/* Bottom link */}
            <rect
                x="6" y="34" width="28" height="18" rx="9"
                stroke={`url(#${id}-g)`}
                strokeWidth="4.5"
                transform="rotate(-28 20 43)"
            />
            {/* Middle link */}
            <rect
                x="18" y="22" width="28" height="18" rx="9"
                stroke={`url(#${id}-g)`}
                strokeWidth="4.5"
                transform="rotate(-28 32 31)"
            />
            {/* Top link */}
            <rect
                x="30" y="10" width="28" height="18" rx="9"
                stroke={`url(#${id}-g)`}
                strokeWidth="4.5"
                transform="rotate(-28 44 19)"
            />
            {/* Center node — persistence spark */}
            <circle cx="32" cy="32" r="4.5" fill={`url(#${id}-core)`} />
        </svg>
    )
}
