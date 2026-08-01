import { useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import './SmokeBurst.css'

interface SmokeBurstProps {
  active: boolean
  onDone?: () => void
  /** Origin as % of viewport, default near chat avatar area (bottom-right) */
  originX?: number
  originY?: number
}

const PARTICLE_COUNT = 28

export default function SmokeBurst({
  active,
  onDone,
  originX = 88,
  originY = 78,
}: SmokeBurstProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const angle = (Math.PI * 2 * i) / PARTICLE_COUNT + (i % 3) * 0.2
        const dist = 28 + (i % 5) * 14 + (i % 2) * 8
        return {
          id: i,
          tx: Math.cos(angle) * dist,
          ty: Math.sin(angle) * dist - 12,
          size: 60 + (i % 6) * 28,
          delay: (i % 7) * 0.02,
          duration: 0.55 + (i % 4) * 0.08,
        }
      }),
    [],
  )

  useEffect(() => {
    if (!active) return
    const t = window.setTimeout(() => onDone?.(), 820)
    return () => window.clearTimeout(t)
  }, [active, onDone])

  if (!active) return null

  return (
    <div
      className="smoke-burst"
      aria-hidden
      style={
        {
          '--smoke-ox': `${originX}%`,
          '--smoke-oy': `${originY}%`,
        } as CSSProperties
      }
    >
      <div className="smoke-burst-flash" />
      {particles.map((p) => (
        <span
          key={p.id}
          className="smoke-puff"
          style={
            {
              '--tx': `${p.tx}vmin`,
              '--ty': `${p.ty}vmin`,
              '--size': `${p.size}px`,
              '--delay': `${p.delay}s`,
              '--dur': `${p.duration}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
