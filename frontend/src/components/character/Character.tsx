import { motion } from 'framer-motion'
import {
  baseAssets,
  emotionAssets,
  type CharacterProps,
  type Emotion,
} from './emotionAssets'
import './Character.css'

/**
 * Layer order (back → front), must match PSD / Canal export:
 * 1 back hair → 2 neck → 3 topwear → 4 ears → 5 face → 6 mouth →
 * 7 eyewhite → 8 headwear → 9 nose → 10 eyelash → 11 irides →
 * 12 eyebrow → 13 front hair
 */
export default function Character({
  emotion = 'normal',
  isTalking = false,
  className = '',
  style,
}: CharacterProps) {
  const face: Emotion = emotion
  const parts = emotionAssets[face]

  return (
    <motion.div
      className={`canal-character ${className}`.trim()}
      style={style}
      animate={
        isTalking
          ? { y: [0, -3, 0, -2, 0], scale: [1, 1.012, 1, 1.008, 1] }
          : { y: [0, -4, 0], scale: [1, 1.015, 1] }
      }
      transition={
        isTalking
          ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 3.6, repeat: Infinity, ease: 'easeInOut' }
      }
      aria-label={`Canal companion (${face})`}
    >
      {/* 1 */}
      <img className="canal-layer" src={baseAssets.backHair} alt="" draggable={false} />
      {/* 2 */}
      <img className="canal-layer" src={baseAssets.neck} alt="" draggable={false} />
      {/* 3 */}
      <img className="canal-layer" src={baseAssets.topwear} alt="" draggable={false} />
      {/* 4 */}
      <img className="canal-layer" src={baseAssets.ears} alt="" draggable={false} />
      {/* 5 */}
      <img className="canal-layer" src={baseAssets.face} alt="" draggable={false} />
      {/* 6 */}
      <img className="canal-layer" src={parts.mouth} alt="" draggable={false} />
      {/* 7 */}
      <img className="canal-layer" src={parts.eyewhite} alt="" draggable={false} />
      {/* 8 */}
      <img className="canal-layer" src={baseAssets.headwear} alt="" draggable={false} />
      {/* 9 */}
      <img className="canal-layer" src={baseAssets.nose} alt="" draggable={false} />
      {/* 10 */}
      <img className="canal-layer" src={parts.eyelash} alt="" draggable={false} />
      {/* 11 */}
      <img className="canal-layer" src={parts.irides} alt="" draggable={false} />
      {/* 12 */}
      <img className="canal-layer" src={parts.eyebrow} alt="" draggable={false} />
      {/* 13 */}
      <img className="canal-layer" src={baseAssets.frontHair} alt="" draggable={false} />
    </motion.div>
  )
}

export type { CharacterProps, Emotion } from './emotionAssets'
export { emotionAssets, emotionAssetPaths, baseAssets } from './emotionAssets'
