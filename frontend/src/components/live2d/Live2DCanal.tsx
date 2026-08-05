import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { Emotion } from '../character/emotionAssets'
import { CANAL_MODEL_URL } from './canalLive2DConfig'
import type { ExpressionName } from './canalExpressions'
import { CanalLive2DController } from './canalLive2DController'
import { loadCubismCore } from './loadCubismCore'
import { readMoc3Version } from './mocVersion'
import './Live2DCanal.css'

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
  /** Called when Live2D cannot load (e.g. moc3 too new for Core). */
  onError?: (message: string) => void
}

type Live2DModelInstance = import('pixi-live2d-display/cubism4').Live2DModel

function layoutModel(model: Live2DModelInstance, width: number, height: number) {
  const bounds = model.getLocalBounds()
  const modelH = Math.max(1, bounds.height || model.height || 1)
  // Half-body: head near top of stage, crop around upper thighs at screen bottom.
  const scale = (height / modelH) * 1.78
  model.scale.set(scale)
  model.anchor.set(0.5, 0)
  model.position.set(width * 0.5, height * 0.02)
}

function friendlyLoadError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/moc3 ver|unsupport later than moc3|Unknown error/i.test(raw)) {
    return (
      'Canal.moc3 is Cubism 5.3 (moc3 v6), but current Cubism Core only supports up to moc3 v5. ' +
      'Re-export the model for SDK 5.0/4.x, or replace public/lib/live2dcubismcore.min.js with Cubism 5 SDK R5+ Core (06.x).'
    )
  }
  return raw || 'Live2D load failed'
}

const Live2DCanal = forwardRef<Live2DCanalHandle, Live2DCanalProps>(function Live2DCanal(
  { className, emotion = 'normal', isTalking = false, onError },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef(new CanalLive2DController())
  const appRef = useRef<import('pixi.js').Application | null>(null)
  const modelRef = useRef<Live2DModelInstance | null>(null)
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
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
    let canvasEl: HTMLCanvasElement | null = null
    let removePointer: (() => void) | null = null

    const fail = (message: string) => {
      if (disposed) return
      setErrorText(message)
      setStatus('error')
      console.error('[Live2DCanal]', message)
      onErrorRef.current?.(message)
    }

    const init = async () => {
      try {
        setStatus('loading')
        setErrorText('')

        const mocUrl = CANAL_MODEL_URL.replace(/\.model3\.json$/i, '.moc3')
        const mocVer = await readMoc3Version(mocUrl)
        if (mocVer != null && mocVer >= 6) {
          fail(friendlyLoadError(new Error(`moc3 ver is [${mocVer}]`)))
          return
        }

        // Must resolve BEFORE importing cubism4 — that module throws on evaluate if Core is missing.
        await loadCubismCore()
        if (disposed) return

        const PIXI = await import('pixi.js')
        const { Live2DModel } = await import('pixi-live2d-display/cubism4')
        Live2DModel.registerTicker(PIXI.Ticker)

        if (disposed) return

        const app = new PIXI.Application({
          backgroundAlpha: 0,
          antialias: true,
          resizeTo: host,
          powerPreference: 'high-performance',
        })
        appRef.current = app
        canvasEl = app.view as HTMLCanvasElement
        host.appendChild(canvasEl)

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
        layoutModel(model, host.clientWidth || 400, host.clientHeight || 500)
        controllerRef.current.attach(model)
        controllerRef.current.startBreathing()

        const onPointerMove = (ev: PointerEvent) => {
          const rect = host.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return
          // Face sits near the top of the half-body crop.
          const faceX = rect.left + rect.width * 0.5
          const faceY = rect.top + rect.height * 0.22
          const nx = (ev.clientX - faceX) / (rect.width * 0.55)
          const ny = (faceY - ev.clientY) / (rect.height * 0.4)
          controllerRef.current.setPointerFocus(nx, ny)
        }
        window.addEventListener('pointermove', onPointerMove, { passive: true })
        removePointer = () => window.removeEventListener('pointermove', onPointerMove)

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
        fail(friendlyLoadError(err))
      }
    }

    void init()

    return () => {
      disposed = true
      removePointer?.()
      resizeObserver?.disconnect()
      controllerRef.current.detach()
      modelRef.current?.destroy()
      modelRef.current = null
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true, baseTexture: true })
        appRef.current = null
      }
      if (canvasEl?.parentNode === host) host.removeChild(canvasEl)
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
