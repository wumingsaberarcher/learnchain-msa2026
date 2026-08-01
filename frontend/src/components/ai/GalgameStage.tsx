import { useCallback, useEffect, useRef, useState } from 'react'
import { LogOut, Mic, Send, X } from 'lucide-react'
import { useChatStore } from '../../stores/chatStore'
import { useCompanionStore } from '../../stores/companionStore'
import { useTranslation } from '../../stores/settingsStore'
import {
  buildEmotionTimeline,
  emotionAt,
  type EmotionCue,
} from '../../companions/emotionTimeline'
import Character from '../character/Character'
import type { Emotion } from '../character/emotionAssets'
import SmokeBurst from './SmokeBurst'
import { useSpeechInput } from './useSpeechInput'
import VoiceVolumeIcon from './VoiceVolumeIcon'
import './GalgameStage.css'

const MS_PER_CHAR = 38

export default function GalgameStage() {
  const { t, language } = useTranslation()
  const { isSending, error, sendMessage, clearError, setListening, isListening } = useChatStore()
  const {
    emotion,
    isTalking,
    setEmotion,
    galSmokePlaying,
    clearGalSmoke,
    exitGalMode,
  } = useCompanionStore()

  const [draft, setDraft] = useState('')
  const [displayText, setDisplayText] = useState('')
  const [fullText, setFullText] = useState('')
  const [typing, setTyping] = useState(false)
  const [introDone, setIntroDone] = useState(false)

  const timelineRef = useRef<EmotionCue[]>([])
  const typeTimerRef = useRef<number | null>(null)
  const charIndexRef = useRef(0)
  const startedIntroRef = useRef(false)
  const forceEmotionRef = useRef<Emotion | null>(null)
  const exitAfterFarewellRef = useRef(false)
  const farewellHoverLockRef = useRef(false)

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
      playLine(t('chat.galIntro'))
      setIntroDone(true)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [galSmokePlaying, playLine, t])

  useEffect(() => () => stopTypewriter(), [stopTypewriter])

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
            window.setTimeout(() => exitGalMode(), 420)
          }
        },
      })
    },
    [exitGalMode, playLine, t],
  )

  const onExitHover = () => {
    if (farewellHoverLockRef.current || isSending) return
    farewellHoverLockRef.current = true
    startFarewell(false)
  }

  const onExitLeave = () => {
    // Allow farewell again next time they hover (after a short cool-down)
    window.setTimeout(() => {
      farewellHoverLockRef.current = false
    }, 900)
  }

  const handleExitClick = () => {
    if (exitAfterFarewellRef.current) {
      exitGalMode()
      return
    }
    // Click without (or during) hover farewell → say goodbye then leave
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

  const errorText = error === 'missing_api_key' ? t('chat.missingApiKey') : error

  return (
    <div className="gal-stage" role="dialog" aria-label={t('chat.galTitle')}>
      <SmokeBurst active={galSmokePlaying} onDone={clearGalSmoke} />

      <button
        type="button"
        className="gal-close"
        title={t('chat.galClose')}
        onClick={handleExitClick}
      >
        <X className="w-5 h-5" />
      </button>

      <div className="gal-stage-bg" />

      <div className="gal-character-wrap">
        <Character
          emotion={emotion}
          isTalking={isTalking || typing || isSending}
          animate
          className="gal-character"
        />
      </div>

      <div className="gal-dialog-stack">
        <div className="gal-dialog-box">
          <div className="gal-dialog-name">Canal</div>
          <p className="gal-dialog-text" aria-live="polite">
            {displayText || (isSending ? t('chat.thinking') : introDone ? '' : '…')}
            {typing && <span className="gal-caret" />}
          </p>
          {fullText && !typing && displayText === fullText && (
            <span className="gal-dialog-hint">{t('chat.galContinue')}</span>
          )}
        </div>

        <div className="gal-input-row">
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
