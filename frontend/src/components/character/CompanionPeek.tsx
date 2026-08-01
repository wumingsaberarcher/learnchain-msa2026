import { AnimatePresence, motion } from 'framer-motion'
import Character from './Character'
import type { Emotion } from './emotionAssets'
import './CompanionPeek.css'

export type PeekSide = 'left' | 'right' | 'bottom'

interface CompanionPeekProps {
  visible: boolean
  emotion?: Emotion
  isTalking?: boolean
  line?: string
  /** Lazy / drowsy vs focused seriousness affects motion. */
  mood?: 'lazy' | 'focus'
  side?: PeekSide
  className?: string
}

export default function CompanionPeek({
  visible,
  emotion = 'normal',
  isTalking = false,
  line,
  mood = 'lazy',
  side = 'right',
  className = '',
}: CompanionPeekProps) {
  const from =
    side === 'left' ? { x: -120, y: 40 }
      : side === 'bottom' ? { x: '-50%', y: 160 }
        : { x: 120, y: 40 }

  const restingX = side === 'bottom' ? '-50%' : 0

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`companion-peek companion-peek-${side} companion-peek-${mood} ${className}`.trim()}
          initial={{ opacity: 0, ...from }}
          animate={{
            opacity: 1,
            x: restingX,
            y: mood === 'lazy' ? [0, 6, 0, 4, 0] : [0, -3, 0],
          }}
          exit={{ opacity: 0, ...from }}
          transition={{
            opacity: { duration: mood === 'lazy' ? 1.1 : 0.45 },
            x: { duration: mood === 'lazy' ? 1.4 : 0.55, ease: 'easeOut' },
            y: {
              duration: mood === 'lazy' ? 4.5 : 2.8,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          }}
        >
          <div className="companion-peek-figure">
            <Character emotion={emotion} isTalking={isTalking} className="companion-peek-character" />
          </div>
          {line && (
            <div className="companion-peek-dialog" role="status">
              <span className="companion-peek-name">Canal</span>
              <p>{line}</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
