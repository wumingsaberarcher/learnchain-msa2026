import type { CSSProperties } from 'react'

import backHair from '../../../Canal/back hair.png'
import neck from '../../../Canal/neck.png'
import topwear from '../../../Canal/topwear.png'
import ears from '../../../Canal/ears.png'
import face from '../../../Canal/face.png'
import headwear from '../../../Canal/headwear.png'
import nose from '../../../Canal/nose.png'
import frontHair from '../../../Canal/front hair.png'

import eyebrow from '../../../Canal/eyebrow/eyebrow.png'
import eyebrowAngry from '../../../Canal/eyebrow/eyebrow_angry.png'
import eyebrowSmile from '../../../Canal/eyebrow/eyebrow_smile.png'
import eyebrowSorrow from '../../../Canal/eyebrow/eyebrow_sorrow.png'
import eyebrowSurprise from '../../../Canal/eyebrow/eyebrow_surprise.png'

import eyelash from '../../../Canal/eyelash/eyelash.png'
import eyelashAngry from '../../../Canal/eyelash/eyelash_angry.png'
import eyelashSmile from '../../../Canal/eyelash/eyelash_smile.png'
import eyelashSorrow from '../../../Canal/eyelash/eyelash_sorrow.png'
import eyelashSurprise from '../../../Canal/eyelash/eyelash_surprise.png'

import eyewhite from '../../../Canal/eyewhite/eyewhite.png'
import eyewhiteAngry from '../../../Canal/eyewhite/eyewhite_angry.png'
import eyewhiteSmile from '../../../Canal/eyewhite/eyewhite_smile.png'
import eyewhiteSorrow from '../../../Canal/eyewhite/eyewhite_sorrow.png'
import eyewhiteSurprise from '../../../Canal/eyewhite/eyewhite_surprise.png'

import irides from '../../../Canal/irides/irides.png'
import iridesAngry from '../../../Canal/irides/irides_angry.png'
import iridesSmile from '../../../Canal/irides/irides_smile.png'
import iridesSorrow from '../../../Canal/irides/irides_sorrow.png'
import iridesSurprise from '../../../Canal/irides/irides_surprise.png'

import mouth from '../../../Canal/mouth/mouth.png'
import mouthAngry from '../../../Canal/mouth/mouth_angry.png'
import mouthSmile from '../../../Canal/mouth/mouth_smile.png'
import mouthSorrow from '../../../Canal/mouth/mouth_sorrow.png'
import mouthSurprise from '../../../Canal/mouth/mouth_surprise.png'

export type Emotion = 'normal' | 'angry' | 'smile' | 'sorrow' | 'surprise'

export type EmotionPart = 'eyebrow' | 'eyelash' | 'eyewhite' | 'irides' | 'mouth'

export type EmotionAssetMap = Record<Emotion, Record<EmotionPart, string>>

/** Relative paths under `frontend/Canal/` (documentation / debugging). */
export const emotionAssetPaths = {
  normal: {
    eyebrow: 'eyebrow/eyebrow.png',
    eyelash: 'eyelash/eyelash.png',
    eyewhite: 'eyewhite/eyewhite.png',
    irides: 'irides/irides.png',
    mouth: 'mouth/mouth.png',
  },
  angry: {
    eyebrow: 'eyebrow/eyebrow_angry.png',
    eyelash: 'eyelash/eyelash_angry.png',
    eyewhite: 'eyewhite/eyewhite_angry.png',
    irides: 'irides/irides_angry.png',
    mouth: 'mouth/mouth_angry.png',
  },
  smile: {
    eyebrow: 'eyebrow/eyebrow_smile.png',
    eyelash: 'eyelash/eyelash_smile.png',
    eyewhite: 'eyewhite/eyewhite_smile.png',
    irides: 'irides/irides_smile.png',
    mouth: 'mouth/mouth_smile.png',
  },
  sorrow: {
    eyebrow: 'eyebrow/eyebrow_sorrow.png',
    eyelash: 'eyelash/eyelash_sorrow.png',
    eyewhite: 'eyewhite/eyewhite_sorrow.png',
    irides: 'irides/irides_sorrow.png',
    mouth: 'mouth/mouth_sorrow.png',
  },
  surprise: {
    eyebrow: 'eyebrow/eyebrow_surprise.png',
    eyelash: 'eyelash/eyelash_surprise.png',
    eyewhite: 'eyewhite/eyewhite_surprise.png',
    irides: 'irides/irides_surprise.png',
    mouth: 'mouth/mouth_surprise.png',
  },
} as const satisfies EmotionAssetMap

/** Resolved Vite URLs — use this in the Character component. */
export const emotionAssets: EmotionAssetMap = {
  normal: {
    eyebrow,
    eyelash,
    eyewhite,
    irides,
    mouth,
  },
  angry: {
    eyebrow: eyebrowAngry,
    eyelash: eyelashAngry,
    eyewhite: eyewhiteAngry,
    irides: iridesAngry,
    mouth: mouthAngry,
  },
  smile: {
    eyebrow: eyebrowSmile,
    eyelash: eyelashSmile,
    eyewhite: eyewhiteSmile,
    irides: iridesSmile,
    mouth: mouthSmile,
  },
  sorrow: {
    eyebrow: eyebrowSorrow,
    eyelash: eyelashSorrow,
    eyewhite: eyewhiteSorrow,
    irides: iridesSorrow,
    mouth: mouthSorrow,
  },
  surprise: {
    eyebrow: eyebrowSurprise,
    eyelash: eyelashSurprise,
    eyewhite: eyewhiteSurprise,
    irides: iridesSurprise,
    mouth: mouthSurprise,
  },
}

export const baseAssets = {
  backHair,
  neck,
  topwear,
  ears,
  face,
  headwear,
  nose,
  frontHair,
} as const

export interface CharacterProps {
  emotion?: Emotion
  isTalking?: boolean
  className?: string
  style?: CSSProperties
}
