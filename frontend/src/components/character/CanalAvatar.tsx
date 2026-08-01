import type { MouseEvent } from 'react'
import Character from './Character'
import type { Emotion } from './emotionAssets'
import './CanalAvatar.css'

interface CanalAvatarProps {
  emotion?: Emotion
  isTalking?: boolean
  /** Visual size preset */
  size?: 'sm' | 'md' | 'lg' | 'fab'
  className?: string
  title?: string
  interactive?: boolean
  onMouseEnter?: (e: MouseEvent<HTMLElement>) => void
  onClick?: (e: MouseEvent<HTMLElement>) => void
}

/**
 * Circular crop of the full layered Canal character (all parts stacked).
 * Do not use a single face.png — the portrait only looks complete when layers combine.
 */
export default function CanalAvatar({
  emotion = 'normal',
  isTalking = false,
  size = 'md',
  className = '',
  title = 'Canal',
  interactive = false,
  onMouseEnter,
  onClick,
}: CanalAvatarProps) {
  const clickable = interactive || !!onClick
  const classNames = `canal-avatar canal-avatar-${size} ${clickable ? 'canal-avatar-interactive' : ''} ${className}`.trim()

  const stage = (
    <div className="canal-avatar-stage">
      <Character emotion={emotion} isTalking={isTalking} animate={false} />
    </div>
  )

  if (clickable) {
    return (
      <button
        type="button"
        className={classNames}
        title={title}
        aria-label={title}
        onMouseEnter={onMouseEnter}
        onClick={onClick}
      >
        {stage}
      </button>
    )
  }

  return (
    <div
      className={classNames}
      title={title}
      aria-label={title}
      onMouseEnter={onMouseEnter}
    >
      {stage}
    </div>
  )
}
