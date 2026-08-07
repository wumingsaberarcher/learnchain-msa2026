import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { History, LogOut, MessageSquare, Mic, Send, X } from 'lucide-react'
import { useChatStore, type UiChatMessage } from '../../stores/chatStore'
import { useCompanionStore } from '../../stores/companionStore'
import { useAssessmentStore } from '../../stores/assessmentStore'
import { useTranslation } from '../../stores/settingsStore'
import {
  buildEmotionTimeline,
  emotionAt,
  type EmotionCue,
} from '../../companions/emotionTimeline'
import Live2DCanal, { type Live2DCanalHandle } from '../live2d/Live2DCanal'
import Character from '../character/Character'
import type { Emotion } from '../character/emotionAssets'
import SmokeBurst from './SmokeBurst'
import AssessmentQuizPanel from './AssessmentQuizPanel'
import { useSpeechInput } from './useSpeechInput'
import VoiceVolumeIcon from './VoiceVolumeIcon'
import './GalgameStage.css'

const MS_PER_CHAR = 38

type GalViewMode = 'dialogue' | 'history'

export default function GalgameStage() {
  const { t, language } = useTranslation()
  const { isSending, error, sendMessage, clearError, setListening, isListening, messages } = useChatStore()
  const {
    emotion,
    isTalking,
    setEmotion,
    galSmokePlaying,
    clearGalSmoke,
    exitGalMode,
  } = useCompanionStore()
  const assessmentActive = useAssessmentStore((s) => s.active)
  const canalLine = useAssessmentStore((s) => s.canalLine)
  const clearCanalLine = useAssessmentStore((s) => s.setCanalLine)
  const closeAssessment = useAssessmentStore((s) => s.close)

  const [draft, setDraft] = useState('')
  const [displayText, setDisplayText] = useState('')
  const [fullText, setFullText] = useState('')
  const [typing, setTyping] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  const [live2dFailed, setLive2dFailed] = useState(false)
  const [dialogMaxHeight, setDialogMaxHeight] = useState<number | null>(null)
  const [handBlocking, setHandBlocking] = useState(false)
  const [blockMutter, setBlockMutter] = useState(false)
  const [viewMode, setViewMode] = useState<GalViewMode>('dialogue')
  const [hoverTickId, setHoverTickId] = useState<string | null>(null)

  const timelineRef = useRef<EmotionCue[]>([])
  const typeTimerRef = useRef<number | null>(null)
  const charIndexRef = useRef(0)
  const startedIntroRef = useRef(false)
  const forceEmotionRef = useRef<Emotion | null>(null)
  const exitAfterFarewellRef = useRef(false)
  const farewellHoverLockRef = useRef(false)
  const live2dRef = useRef<Live2DCanalHandle>(null)
  const dialogStackRef = useRef<HTMLDivElement>(null)
  const dialogBoxRef = useRef<HTMLDivElement>(null)
  const inputRowRef = useRef<HTMLDivElement>(null)
  const blockCooldownRef = useRef(0)
  const wasOverFaceRef = useRef(false)
  const historyListRef = useRef<HTMLDivElement>(null)
  const playedCanalLineRef = useRef<string | null>(null)

  const historyMessages = useMemo(
    () => messages.filter((m) => m.kind !== 'aside' && (m.role === 'user' || m.role === 'assistant')),
    [messages],
  )

  const stopTypewriter = useCallback(() => {
    if (typeTimerRef.current != null) {
      window.clearInterval(typeTimerRef.current)
      typeTimerRef.current = null
    }
    setTyping(false)
  }, [])

  const playLine = useCallback(
    (text: string, options?: { forceEmotion?: Emotion; onComplete?: () => void }) => {
      stopTypewriter()
      const line = text.trim()
      if (!line) {
        options?.onComplete?.()
        return
      }

      forceEmotionRef.current = options?.forceEmotion ?? null
      timelineRef.current = buildEmotionTimeline(line)
      charIndexRef.current = 0
      setFullText(line)
      setDisplayText('')
      setTyping(true)
      setViewMode('dialogue')

      const face0 = options?.forceEmotion ?? emotionAt(timelineRef.current, 0)
      setEmotion(face0, true)

      typeTimerRef.current = window.setInterval(() => {
        charIndexRef.current += 1
        const i = charIndexRef.current
        if (i >= line.length) {
          setDisplayText(line)
          stopTypewriter()
          const faceEnd = forceEmotionRef.current ?? emotionAt(timelineRef.current, line.length)
          setEmotion(faceEnd, false)
          forceEmotionRef.current = null
          options?.onComplete?.()
          return
        }
        setDisplayText(line.slice(0, i))
        const next: Emotion = forceEmotionRef.current ?? emotionAt(timelineRef.current, i)
        setEmotion(next, true)
      }, MS_PER_CHAR)
    },
    [setEmotion, stopTypewriter],
  )

  useEffect(() => {
    if (startedIntroRef.current) return
    startedIntroRef.current = true
    const delay = galSmokePlaying ? 520 : 80
    const timer = window.setTimeout(() => {
      if (assessmentActive) {
        playLine(t('assess.startLine', { name: useAssessmentStore.getState().habitName || '…' }))
      } else {
        playLine(t('chat.galIntro'))
      }
      setIntroDone(true)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [galSmokePlaying, playLine, t, assessmentActive])

  useEffect(() => () => stopTypewriter(), [stopTypewriter])

  useEffect(() => {
    if (!canalLine || canalLine === playedCanalLineRef.current) return
    playedCanalLineRef.current = canalLine
    playLine(canalLine)
    clearCanalLine(null)
  }, [canalLine, playLine, clearCanalLine])

  /** Keep dialog below Canal's face; she "pushes" it down when it climbs too high. */
  useEffect(() => {
    const stack = dialogStackRef.current
    const box = dialogBoxRef.current
    if (!stack || !box) return

    const FACE_LINE_RATIO = 0.36
    const MIN_BOX = 120

    const measure = () => {
      const vh = window.innerHeight
      const faceLine = vh * FACE_LINE_RATIO
      const stackBottom = stack.getBoundingClientRect().bottom
      const inputH = inputRowRef.current?.offsetHeight ?? 56
      const gap = 12
      const maxH = Math.max(MIN_BOX, stackBottom - faceLine - inputH - gap)
      setDialogMaxHeight(maxH)

      const textEl = box.querySelector('.gal-dialog-text') as HTMLElement | null
      const natural =
        (textEl?.scrollHeight ?? 0) +
        (box.querySelector('.gal-dialog-name')?.clientHeight ?? 0) +
        (box.querySelector('.gal-dialog-hint')?.clientHeight ?? 0) +
        48
      const overFace = natural > maxH + 8

      if (overFace && !wasOverFaceRef.current && Date.now() > blockCooldownRef.current) {
        wasOverFaceRef.current = true
        blockCooldownRef.current = Date.now() + 4200
        setHandBlocking(true)
        setBlockMutter(true)
        live2dRef.current?.playBlockGesture()
        window.setTimeout(() => setHandBlocking(false), 1100)
        window.setTimeout(() => setBlockMutter(false), 2200)
      } else if (!overFace) {
        wasOverFaceRef.current = false
      }
    }

    measure()
    const ro = new ResizeObserver(() => measure())
    ro.observe(box)
    ro.observe(stack)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [displayText, typing, fullText, viewMode])

  const speech = useSpeechInput({
    language,
    onResult: (transcript) => {
      setDraft((prev) => (prev ? `${prev} ${transcript}` : transcript).trim())
    },
    onListeningChange: setListening,
    onError: () => setListening(false),
  })

  const startFarewell = useCallback(
    (thenExit: boolean) => {
      const face: Emotion = Math.random() < 0.5 ? 'angry' : 'sorrow'
      const line = face === 'angry' ? t('chat.galFarewellAngry') : t('chat.galFarewellSorrow')
      exitAfterFarewellRef.current = thenExit
      playLine(line, {
        forceEmotion: face,
        onComplete: () => {
          if (exitAfterFarewellRef.current) {
            exitAfterFarewellRef.current = false
            window.setTimeout(() => {
              closeAssessment()
              exitGalMode()
            }, 420)
          }
        },
      })
    },
    [exitGalMode, playLine, t, closeAssessment],
  )

  const onExitHover = () => {
    if (farewellHoverLockRef.current || isSending) return
    farewellHoverLockRef.current = true
    startFarewell(false)
  }

  const onExitLeave = () => {
    window.setTimeout(() => {
      farewellHoverLockRef.current = false
    }, 900)
  }

  const handleExitClick = () => {
    if (exitAfterFarewellRef.current) {
      closeAssessment()
      exitGalMode()
      return
    }
    farewellHoverLockRef.current = true
    startFarewell(true)
  }

  const handleSend = async () => {
    if (!draft.trim() || isSending || typing) return
    const text = draft.trim()
    setDraft('')
    stopTypewriter()
    setEmotion('normal', true)
    setDisplayText(language.startsWith('zh') ? '……' : '...')
    await sendMessage(text, language)
    const msgs = useChatStore.getState().messages
    const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant' && m.kind !== 'aside')
    if (lastAssistant?.content) {
      playLine(lastAssistant.content)
    } else {
      const err = useChatStore.getState().error
      playLine(
        err === 'missing_api_key'
          ? t('chat.missingApiKey')
          : err || t('chat.galFallback'),
      )
    }
  }

  const scrollToMessage = (id: string) => {
    setViewMode('history')
    window.requestAnimationFrame(() => {
      const el = historyListRef.current?.querySelector(`[data-msg-id="${id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  const hoverMsg = historyMessages.find((m) => m.id === hoverTickId)
  const errorText = error === 'missing_api_key' ? t('chat.missingApiKey') : error

  return (
    <div className={`gal-stage${assessmentActive ? ' has-assess' : ''}`} role="dialog" aria-label={t('chat.galTitle')}>
      <SmokeBurst active={galSmokePlaying} onDone={clearGalSmoke} />

      <div className="gal-topbar">
        <div className="gal-mode-toggle" role="tablist" aria-label={t('chat.galTitle')}>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'dialogue'}
            className={viewMode === 'dialogue' ? 'active' : ''}
            onClick={() => setViewMode('dialogue')}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {t('chat.galModeDialogue')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'history'}
            className={viewMode === 'history' ? 'active' : ''}
            onClick={() => setViewMode('history')}
          >
            <History className="w-3.5 h-3.5" />
            {t('chat.galModeHistory')}
          </button>
        </div>
        <button
          type="button"
          className="gal-close"
          title={t('chat.galClose')}
          onClick={handleExitClick}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="gal-stage-bg" />

      <div className="gal-character-wrap">
        {live2dFailed ? (
          <Character
            emotion={emotion}
            isTalking={isTalking || typing || isSending}
            animate
            className="gal-character"
          />
        ) : (
          <Live2DCanal
            ref={live2dRef}
            emotion={emotion}
            isTalking={isTalking || typing || isSending}
            className="gal-live2d"
            onError={() => setLive2dFailed(true)}
          />
        )}
      </div>

      {assessmentActive && <AssessmentQuizPanel onCanalSpeak={playLine} />}

      <div className="gal-tick-rail" aria-label={t('chat.galTimeline')}>
        {historyMessages.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`gal-tick ${m.role === 'assistant' ? 'long' : 'short'}${hoverTickId === m.id ? ' hover' : ''}`}
            onMouseEnter={() => setHoverTickId(m.id)}
            onMouseLeave={() => setHoverTickId(null)}
            onClick={() => scrollToMessage(m.id)}
            title={m.content.slice(0, 40)}
          />
        ))}
        {hoverMsg && (
          <div className="gal-tick-preview" role="tooltip">
            <strong>{hoverMsg.role === 'assistant' ? 'Canal' : 'You'}</strong>
            <p>{hoverMsg.content.slice(0, 40)}{hoverMsg.content.length > 40 ? '…' : ''}</p>
          </div>
        )}
      </div>

      <div className={`gal-dialog-stack ${handBlocking ? 'is-blocked' : ''}`} ref={dialogStackRef}>
        {viewMode === 'history' ? (
          <div className="gal-history-panel" ref={historyListRef}>
            {historyMessages.length === 0 ? (
              <p className="gal-history-empty">{language.startsWith('zh') ? '还没有对话记录' : 'No messages yet'}</p>
            ) : (
              historyMessages.map((m: UiChatMessage) => (
                <div
                  key={m.id}
                  data-msg-id={m.id}
                  className={`gal-history-bubble ${m.role}`}
                >
                  <div className="gal-history-role">{m.role === 'assistant' ? 'Canal' : 'You'}</div>
                  <p>{m.content}</p>
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            {blockMutter && (
              <div className="gal-block-mutter" role="status">
                {t('chat.galBlockFace')}
              </div>
            )}
            <div
              className={`gal-dialog-box ${handBlocking ? 'is-hand-blocked' : ''}`}
              ref={dialogBoxRef}
              style={dialogMaxHeight != null ? { maxHeight: dialogMaxHeight } : undefined}
            >
              {handBlocking && (
                <div className="gal-hand-block" aria-hidden>
                  <span className="gal-hand-sleeve" />
                  <span className="gal-hand-palm" />
                </div>
              )}
              <div className="gal-dialog-name">Canal</div>
              <p className="gal-dialog-text" aria-live="polite">
                {displayText || (isSending ? t('chat.thinking') : introDone ? '' : '…')}
                {typing && <span className="gal-caret" />}
              </p>
              {fullText && !typing && displayText === fullText && (
                <span className="gal-dialog-hint">{t('chat.galContinue')}</span>
              )}
            </div>
          </>
        )}

        <div className="gal-input-row" ref={inputRowRef}>
          <textarea
            className="gal-input"
            rows={1}
            value={draft}
            placeholder={t('chat.galPlaceholder')}
            disabled={isSending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
          />
          <button
            type="button"
            className={`gal-icon-btn ${isListening ? 'listening' : ''}`}
            title={speech.supported ? (isListening ? t('chat.voiceStop') : t('chat.voice')) : t('chat.voiceUnsupported')}
            disabled={!speech.supported || isSending}
            onClick={() => speech.toggle()}
          >
            {isListening
              ? <VoiceVolumeIcon level={speech.volumeLevel} className="w-4 h-4" />
              : <Mic className="w-4 h-4" />}
          </button>
          <button
            type="button"
            className="gal-send-btn"
            title={t('chat.send')}
            disabled={isSending || typing || !draft.trim()}
            onClick={() => void handleSend()}
          >
            <Send className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="gal-exit-btn"
            title={t('chat.galExit')}
            onMouseEnter={onExitHover}
            onMouseLeave={onExitLeave}
            onClick={handleExitClick}
          >
            <LogOut className="w-4 h-4" />
            <span>{t('chat.galExit')}</span>
          </button>
        </div>

        {errorText && (
          <button type="button" className="gal-error" onClick={clearError}>
            {errorText}
          </button>
        )}
      </div>
    </div>
  )
}
