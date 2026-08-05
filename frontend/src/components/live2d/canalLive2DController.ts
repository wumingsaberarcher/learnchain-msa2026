import type { Live2DModel } from 'pixi-live2d-display/cubism4'
import { clampParam, CanalParams } from './canalLive2DConfig'
import { EXPRESSION_PRESETS, type ExpressionName } from './canalExpressions'

type CubismCoreModel = {
  setParameterValueById(id: string, value: number, weight?: number): void
}

type CubismInternal = {
  coreModel: CubismCoreModel
  breath?: { setParameters: (params: unknown[]) => void }
}

const ALL_EXPRESSION_KEYS = new Set(
  Object.values(EXPRESSION_PRESETS).flatMap(p => Object.keys(p)),
)

function mergeExpressionPreset(name: ExpressionName): Record<string, number> {
  const preset = EXPRESSION_PRESETS[name] ?? EXPRESSION_PRESETS.normal
  const merged = { ...EXPRESSION_PRESETS.normal, ...preset }
  const out: Record<string, number> = {}
  for (const key of ALL_EXPRESSION_KEYS) {
    out[key] = merged[key] ?? 0
  }
  return out
}

export class CanalLive2DController {
  private model: Live2DModel | null = null
  private breathing = true
  private breathPhase = 0
  private blinkTimer = 2.8
  private blinking = false
  private blinkPhase = 0
  private mouthOpen = 0
  private eyeOpen = 1
  private headX = 0
  private headY = 0
  private expressionName: ExpressionName = 'normal'
  private expressionCurrent: Record<string, number> = {}
  private expressionTarget: Record<string, number> = {}
  private talking = false
  private talkPhase = 0

  attach(model: Live2DModel) {
    this.model = model
    const internal = model.internalModel as CubismInternal
    // Use our own breath/blink loop — built-in breath swings angles too aggressively.
    internal.breath?.setParameters([])
    this.expressionCurrent = mergeExpressionPreset('normal')
    this.expressionTarget = mergeExpressionPreset('normal')
    this.applyStaticParams()
  }

  detach() {
    this.model = null
  }

  private core(): CubismCoreModel | null {
    if (!this.model?.internalModel) return null
    return (this.model.internalModel as CubismInternal).coreModel
  }

  private setParam(id: string, value: number, weight = 1) {
    this.core()?.setParameterValueById(id, clampParam(id, value), weight)
  }

  setExpression(name: ExpressionName) {
    this.expressionName = name
    this.expressionTarget = mergeExpressionPreset(name)
  }

  setMouthOpen(value: number) {
    this.mouthOpen = clampParam(CanalParams.mouthOpen, value)
  }

  setEyeOpen(value: number) {
    this.eyeOpen = clampParam(CanalParams.eyeLOpen, value)
  }

  setHeadAngle(x: number, y: number) {
    this.headX = clampParam(CanalParams.angleX, x)
    this.headY = clampParam(CanalParams.angleY, y)
  }

  setTalking(active: boolean) {
    this.talking = active
    if (!active) this.mouthOpen = 0
  }

  startBreathing() {
    this.breathing = true
  }

  stopBreathing() {
    this.breathing = false
    this.setParam(CanalParams.breath, 0)
  }

  tick(dtMs: number) {
    if (!this.model) return
    const dt = dtMs / 1000

    if (this.breathing) {
      this.breathPhase += dt * 0.85
      const breath = 0.5 + Math.sin(this.breathPhase) * 0.22
      this.setParam(CanalParams.breath, breath)
      // Subtle hair sway tied to breath — keep amplitude low.
      const sway = Math.sin(this.breathPhase * 1.1) * 0.08
      this.setParam(CanalParams.hairFront, sway)
      this.setParam(CanalParams.hairSide, sway * 0.7)
      this.setParam(CanalParams.hairBack, sway * 0.5)
    }

    this.updateBlink(dt)
    this.updateExpression(dt)
    this.updateMouth(dt)
    this.applyStaticParams()
  }

  private updateBlink(dt: number) {
    if (this.blinking) {
      this.blinkPhase += dt * 9
      const t = this.blinkPhase
      const open = t < 0.15 ? 1 - t / 0.15 : Math.min(1, (t - 0.15) / 0.12)
      this.setParam(CanalParams.eyeLOpen, open * this.eyeOpen)
      this.setParam(CanalParams.eyeROpen, open * this.eyeOpen)
      if (t >= 0.35) {
        this.blinking = false
        this.blinkPhase = 0
        this.blinkTimer = 2.5 + Math.random() * 3.5
      }
      return
    }

    this.blinkTimer -= dt
    if (this.blinkTimer <= 0) {
      this.blinking = true
      this.blinkPhase = 0
    }
  }

  private updateExpression(dt: number) {
    const speed = 4.5 * dt
    for (const key of ALL_EXPRESSION_KEYS) {
      const target = this.expressionTarget[key] ?? 0
      const current = this.expressionCurrent[key] ?? 0
      const next = current + (target - current) * Math.min(1, speed)
      this.expressionCurrent[key] = next
      if (Math.abs(next) > 0.001) {
        this.setParam(key, next)
      }
    }
    void this.expressionName
  }

  private updateMouth(dt: number) {
    if (this.talking) {
      this.talkPhase += dt * 11
      const talkOpen = 0.15 + (Math.sin(this.talkPhase) * 0.5 + 0.5) * 0.45
      this.setParam(CanalParams.mouthOpen, talkOpen)
      return
    }
    if (this.mouthOpen > 0) {
      this.setParam(CanalParams.mouthOpen, this.mouthOpen)
    }
  }

  private applyStaticParams() {
    this.setParam(CanalParams.angleX, this.headX)
    this.setParam(CanalParams.angleY, this.headY)
    if (!this.blinking) {
      this.setParam(CanalParams.eyeLOpen, this.eyeOpen)
      this.setParam(CanalParams.eyeROpen, this.eyeOpen)
    }
  }
}
