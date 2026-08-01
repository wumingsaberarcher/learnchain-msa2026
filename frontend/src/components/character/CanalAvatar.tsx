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
}: CanalAvatarProps) {
  return (
    <div
      className={`canal-avatar canal-avatar-${size} ${className}`.trim()}
      title={title}
      aria-label={title}
    >
      <div className="canal-avatar-stage">
        <Character emotion={emotion} isTalking={isTalking} animate={size === 'lg'} />
      </div>
    </div>
  )
}
