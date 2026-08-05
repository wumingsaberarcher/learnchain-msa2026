import type { Emotion } from '../character/emotionAssets'
import { CanalParams } from './canalLive2DConfig'

export type ExpressionName = Emotion | string

/** Manual expression presets (model has no .exp3.json yet). */
export const EXPRESSION_PRESETS: Record<ExpressionName, Partial<Record<string, number>>> = {
  normal: {
    [CanalParams.mouthForm]: 0,
    [CanalParams.mouthOpen]: 0,
    [CanalParams.eyeLSmile]: 0,
    [CanalParams.eyeRSmile]: 0,
    [CanalParams.browLY]: 0,
    [CanalParams.browRY]: 0,
    [CanalParams.browLAngle]: 0,
    [CanalParams.browRAngle]: 0,
    [CanalParams.cheek]: 0,
  },
  smile: {
    [CanalParams.mouthForm]: 0.65,
    [CanalParams.eyeLSmile]: 0.45,
    [CanalParams.eyeRSmile]: 0.45,
    [CanalParams.browLY]: 0.15,
    [CanalParams.browRY]: 0.15,
    [CanalParams.cheek]: 0.35,
  },
  angry: {
    [CanalParams.mouthForm]: -0.35,
    [CanalParams.browLY]: -0.55,
    [CanalParams.browRY]: -0.55,
    [CanalParams.browLAngle]: -0.25,
    [CanalParams.browRAngle]: 0.25,
  },
  sorrow: {
    [CanalParams.mouthForm]: -0.25,
    [CanalParams.browLY]: 0.35,
    [CanalParams.browRY]: 0.35,
    [CanalParams.browLAngle]: -0.2,
    [CanalParams.browRAngle]: 0.2,
    [CanalParams.eyeLSmile]: -0.1,
    [CanalParams.eyeRSmile]: -0.1,
  },
  surprise: {
    [CanalParams.mouthOpen]: 0.35,
    [CanalParams.mouthForm]: 0.2,
    [CanalParams.browLY]: 0.55,
    [CanalParams.browRY]: 0.55,
    [CanalParams.eyeLOpen]: 1.1,
    [CanalParams.eyeROpen]: 1.1,
  },
  fear: {
    [CanalParams.mouthOpen]: 0.2,
    [CanalParams.mouthForm]: -0.15,
    [CanalParams.browLY]: 0.45,
    [CanalParams.browRY]: 0.45,
    [CanalParams.browLAngle]: 0.15,
    [CanalParams.browRAngle]: -0.15,
    [CanalParams.cheek]: 0.15,
  },
}
