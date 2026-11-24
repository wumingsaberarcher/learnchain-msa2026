import { motion } from 'framer-motion'
import {
  baseAssets,
  emotionAssets,
  expressionPlates,
  type CharacterProps,
  type Emotion,
} from './emotionAssets'
import './Character.css'

/**
 * Default: full expression plate (4× + white keyed).
 * usePlate={false}: layered PNG stack (PSD export order).
 */
export default function Character({
  emotion = 'normal',
  isTalking = false,
  animate = true,
  className = '',
  style,
  usePlate = true,
}: CharacterProps & { animate?: boolean }) {
  const face: Emotion = emotion
  const parts = emotionAssets[face]
  const plate = expressionPlates[face]

  return (
    <motion.div
      className={`canal-character ${className}`.trim()}
      style={style}
      animate={
        animate
          ? (isTalking
            ? { y: [0, -3, 0, -2, 0], scale: [1, 1.012, 1, 1.008, 1] }
            : { y: [0, -4, 0], scale: [1, 1.015, 1] })
          : { y: 0, scale: 1 }
      }
      transition={
        animate
          ? (isTalking
            ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 3.6, repeat: Infinity, ease: 'easeInOut' })
          : { duration: 0 }
      }
      aria-label={`Canal companion (${face})`}
    >
      {usePlate ? (
        <img className="canal-layer" src={plate} alt="" draggable={false} />
      ) : (
        <>
          <img className="canal-layer" src={baseAssets.backHair} alt="" draggable={false} />
          <img className="canal-layer" src={baseAssets.neck} alt="" draggable={false} />
          <img className="canal-layer" src={baseAssets.topwear} alt="" draggable={false} />
          <img className="canal-layer" src={baseAssets.ears} alt="" draggable={false} />
          <img className="canal-layer" src={baseAssets.face} alt="" draggable={false} />
          <img className="canal-layer" src={parts.mouth} alt="" draggable={false} />
          <img className="canal-layer" src={parts.eyewhite} alt="" draggable={false} />
          <img className="canal-layer" src={baseAssets.headwear} alt="" draggable={false} />
          <img className="canal-layer" src={baseAssets.nose} alt="" draggable={false} />
          <img className="canal-layer" src={parts.eyelash} alt="" draggable={false} />
          <img className="canal-layer" src={parts.irides} alt="" draggable={false} />
          <img className="canal-layer" src={parts.eyebrow} alt="" draggable={false} />
          <img className="canal-layer" src={baseAssets.frontHair} alt="" draggable={false} />
        </>
      )}
    </motion.div>
  )
}

export type { CharacterProps, Emotion } from './emotionAssets'
export { emotionAssets, emotionAssetPaths, baseAssets, expressionPlates } from './emotionAssets'
