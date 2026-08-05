/** Live2D parameter IDs from Canal.cdi3.json */
export const CanalParams = {
  angleX: 'ParamAngleX',
  angleY: 'ParamAngleY',
  angleZ: 'ParamAngleZ',
  eyeLOpen: 'ParamEyeLOpen',
  eyeROpen: 'ParamEyeROpen',
  eyeLSmile: 'ParamEyeLSmile',
  eyeRSmile: 'ParamEyeRSmile',
  eyeBallX: 'ParamEyeBallX',
  eyeBallY: 'ParamEyeBallY',
  browLY: 'ParamBrowLY',
  browRY: 'ParamBrowRY',
  browLX: 'ParamBrowLX',
  browRX: 'ParamBrowRX',
  browLAngle: 'ParamBrowLAngle',
  browRAngle: 'ParamBrowRAngle',
  browLForm: 'ParamBrowLForm',
  browRForm: 'ParamBrowRForm',
  mouthForm: 'ParamMouthForm',
  mouthOpen: 'ParamMouthOpenY',
  cheek: 'ParamCheek',
  bodyAngleX: 'ParamBodyAngleX',
  bodyAngleY: 'ParamBodyAngleY',
  bodyAngleZ: 'ParamBodyAngleZ',
  breath: 'ParamBreath',
  hairFront: 'ParamHairFront',
  hairSide: 'ParamHairSide',
  hairBack: 'ParamHairBack',
} as const

export type CanalParamId = (typeof CanalParams)[keyof typeof CanalParams]

/** Clamp ranges — keep poses within natural limits. */
export const PARAM_LIMITS: Partial<Record<CanalParamId, readonly [number, number]>> = {
  [CanalParams.angleX]: [-22, 22],
  [CanalParams.angleY]: [-18, 18],
  [CanalParams.angleZ]: [-12, 12],
  [CanalParams.bodyAngleX]: [-8, 8],
  [CanalParams.bodyAngleY]: [-6, 6],
  [CanalParams.bodyAngleZ]: [-5, 5],
  [CanalParams.mouthOpen]: [0, 1],
  [CanalParams.mouthForm]: [-1, 1],
  [CanalParams.eyeLOpen]: [0, 1.2],
  [CanalParams.eyeROpen]: [0, 1.2],
  [CanalParams.eyeBallX]: [-0.85, 0.85],
  [CanalParams.eyeBallY]: [-0.7, 0.7],
  [CanalParams.breath]: [0, 1],
  [CanalParams.hairFront]: [-1, 1],
  [CanalParams.hairSide]: [-1, 1],
  [CanalParams.hairBack]: [-1, 1],
  [CanalParams.cheek]: [0, 1],
}

export const CANAL_MODEL_URL = '/Canal/Canal-vts/Canal.model3.json'
export const CUBISM_CORE_URL = '/lib/live2dcubismcore.min.js'

export function clampParam(id: string, value: number): number {
  const limits = PARAM_LIMITS[id as CanalParamId]
  if (!limits) return value
  return Math.min(limits[1], Math.max(limits[0], value))
}
