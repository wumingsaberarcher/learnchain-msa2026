import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { pickRapidTease, pickRouteTease, type TeasePayload } from '../companions/teaseLines'
import { useCompanionStore } from '../stores/companionStore'
import { useHabitStore } from '../stores/habitStore'
import { useTranslation } from '../stores/settingsStore'
import Character from './character/Character'
import './CompanionTease.css'

const SHOW_MS = 5200
const ROUTE_COOLDOWN_MS = 45_000
const RAPID_WINDOW_MS = 900
const RAPID_CLICKS = 6

/**
 * Mischievous Canal pop-ins while browsing.
 * Fake +/- affinity numbers — unrelated to real CompanionAffection.
 */
export default function CompanionTeaseOverlay() {
  const { language } = useTranslation()
  const location = useLocation()
  const isLoggedIn = useHabitStore(s => s.isLoggedIn)
  const galModeOpen = useCompanionStore(s => s.galModeOpen)
  const setEmotion = useCompanionStore(s => s.setEmotion)

  const [tease, setTease] = useState<TeasePayload | null>(null)
  const lastRouteAt = useRef(0)
  const lastPath = useRef('')
  const clickTimes = useRef<number[]>([])
  const hideTimer = useRef<number | null>(null)

  const show = (payload: TeasePayload) => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    setTease(payload)
    setEmotion(payload.emotion, true)
    hideTimer.current = window.setTimeout(() => {
      setTease(null)
      setEmotion(useCompanionStore.getState().emotion, false)
    }, SHOW_MS)
  }

  useEffect(() => {
    if (!isLoggedIn || galModeOpen) return
    const path = location.pathname
    if (path === lastPath.current) return
    lastPath.current = path
    const now = Date.now()
    if (now - lastRouteAt.current < ROUTE_COOLDOWN_MS) return
    const payload = pickRouteTease(path, language)
    if (!payload) return
    // Delay so navigation settles
    const t = window.setTimeout(() => {
      lastRouteAt.current = Date.now()
      show(payload)
    }, 700)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, isLoggedIn, galModeOpen, language])

  useEffect(() => {
    if (!isLoggedIn || galModeOpen) return
    const onClick = () => {
      const now = Date.now()
      clickTimes.current = [...clickTimes.current.filter(t => now - t < RAPID_WINDOW_MS), now]
      if (clickTimes.current.length >= RAPID_CLICKS) {
        clickTimes.current = []
        show(pickRapidTease(language))
      }
    }
    window.addEventListener('click', onClick, { passive: true })
    return () => window.removeEventListener('click', onClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, galModeOpen, language])

  useEffect(() => () => {
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
  }, [])

  if (!isLoggedIn) return null

  return (
    <AnimatePresence>
      {tease && (
        <motion.div
          className={`companion-tease companion-tease-${tease.kind}`}
          initial={{ opacity: 0, x: 80, y: 20 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ duration: 0.35 }}
          role="status"
        >
          <div className="companion-tease-figure">
            <Character emotion={tease.emotion} isTalking animate className="companion-tease-character" />
          </div>
          <div className="companion-tease-bubble">
            <span className={`companion-tease-delta ${tease.delta >= 0 ? 'plus' : 'minus'}`}>
              {language.startsWith('zh')
                ? (tease.delta >= 0 ? `好感度 +${tease.delta}` : `好感度 ${tease.delta}`)
                : (tease.delta >= 0 ? `Affinity +${tease.delta}` : `Affinity ${tease.delta}`)}
            </span>
            <p>{tease.line}</p>
            <em className="companion-tease-fake">{language.startsWith('zh') ? '恶作剧 · 不计真实好感' : 'Prank · not real affinity'}</em>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
