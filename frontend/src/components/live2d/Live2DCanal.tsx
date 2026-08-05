import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import type { Emotion } from '../character/emotionAssets'
import { CANAL_MODEL_URL } from './canalLive2DConfig'
import type { ExpressionName } from './canalExpressions'
import { CanalLive2DController } from './canalLive2DController'
import { loadCubismCore } from './loadCubismCore'
import './Live2DCanal.css'

Live2DModel.registerTicker(PIXI.Ticker)

export interface Live2DCanalHandle {
  setExpression: (name: ExpressionName) => void
  setMouthOpen: (value: number) => void
  setEyeOpen: (value: number) => void
  setHeadAngle: (x: number, y: number) => void
  startBreathing: () => void
  stopBreathing: () => void
}

export interface Live2DCanalProps {
  className?: string
  /** Synced from companion / chat emotion — drives expression preset. */
  emotion?: Emotion
  /** Lip-sync style mouth motion while speaking. */
  isTalking?: boolean
}

function layoutModel(model: Live2DModel, width: number, height: number) {
  const bounds = model.getLocalBounds()
  const modelW = bounds.width || model.width || 1
  const modelH = bounds.height || model.height || 1
  const scale = Math.min(width / modelW, height / modelH) * 0.95
  model.scale.set(scale)
  model.anchor.set(0.5, 1)
  model.position.set(width / 2, height * 0.98)
}

const Live2DCanal = forwardRef<Live2DCanalHandle, Live2DCanalProps>(function Live2DCanal(
  { className, emotion = 'normal', isTalking = false },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef(new CanalLive2DController())
  const appRef = useRef<PIXI.Application | null>(null)
  const modelRef = useRef<Live2DModel | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorText, setErrorText] = useState('')

  useImperativeHandle(ref, () => ({
    setExpression: (name) => controllerRef.current.setExpression(name),
    setMouthOpen: (value) => controllerRef.current.setMouthOpen(value),
    setEyeOpen: (value) => controllerRef.current.setEyeOpen(value),
    setHeadAngle: (x, y) => controllerRef.current.setHeadAngle(x, y),
    startBreathing: () => controllerRef.current.startBreathing(),
    stopBreathing: () => controllerRef.current.stopBreathing(),
  }))

  useEffect(() => {
    controllerRef.current.setExpression(emotion)
  }, [emotion])

  useEffect(() => {
    controllerRef.current.setTalking(isTalking)
  }, [isTalking])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    let resizeObserver: ResizeObserver | null = null

    const init = async () => {
      try {
        setStatus('loading')
        setErrorText('')
        await loadCubismCore()

        if (disposed) return

        const app = new PIXI.Application({
          backgroundAlpha: 0,
          antialias: true,
          resizeTo: host,
          powerPreference: 'high-performance',
        })
        appRef.current = app
        host.appendChild(app.view as HTMLCanvasElement)

        const model = await Live2DModel.from(CANAL_MODEL_URL, {
          autoInteract: false,
          autoUpdate: true,
        })

        if (disposed) {
          model.destroy()
          app.destroy(true, { children: true, texture: true, baseTexture: true })
          return
        }

        modelRef.current = model
        app.stage.addChild(model)
        layoutModel(model, host.clientWidth, host.clientHeight)
        controllerRef.current.attach(model)
        controllerRef.current.startBreathing()

        app.ticker.add(() => {
          controllerRef.current.tick(app.ticker.deltaMS)
        })

        const onResize = () => {
          if (!modelRef.current) return
          layoutModel(modelRef.current, host.clientWidth, host.clientHeight)
        }
        resizeObserver = new ResizeObserver(onResize)
        resizeObserver.observe(host)

        setStatus('ready')
      } catch (err) {
        if (disposed) return
        const message = err instanceof Error ? err.message : 'Live2D load failed'
        setErrorText(message)
        setStatus('error')
        console.error('[Live2DCanal]', err)
      }
    }

    void init()

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      controllerRef.current.detach()
      modelRef.current?.destroy()
      modelRef.current = null
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true, baseTexture: true })
        appRef.current = null
      }
      if (host.firstChild) host.removeChild(host.firstChild)
    }
  }, [])

  return (
    <div className={`live2d-canal ${className ?? ''}`.trim()} ref={hostRef}>
      {status === 'loading' && <div className="live2d-canal-status">Loading Canal…</div>}
      {status === 'error' && (
        <div className="live2d-canal-status live2d-canal-error" role="alert">
          {errorText || 'Live2D failed'}
        </div>
      )}
    </div>
  )
})

export default Live2DCanal
