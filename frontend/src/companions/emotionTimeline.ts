import type { Emotion } from '../components/character/emotionAssets'
import { inferEmotionFromText } from './companionLines'

export interface EmotionCue {
  start: number
  end: number
  emotion: Emotion
  /** 0–1; strong cues only jump to intense faces */
  intensity: number
}

const STRONG_ANGRY = /生气|愤怒|讨厌|烦死|怒|可恶|混蛋|angry|hate|furious/i
const STRONG_SORROW = /难过|伤心|哭|抱歉|对不起|失望|孤独|sorrow|sad|sorry|lonely|cry/i
const STRONG_SURPRISE = /天哪|哇+|惊喜|不敢相信|震惊|surprise|wow+|omg|!{2,}|\uFF01{2,}/i
const STRONG_SMILE = /哈哈+|太好了|真棒|开心|喜欢|爱你|great|happy|love|awesome|yay/i

/** Split on clause punctuation while keeping indices into the original string. */
function splitClauses(text: string): Array<{ start: number; end: number; text: string }> {
  const clauses: Array<{ start: number; end: number; text: string }> = []
  const re = /[^。！？；!?;\n]+[。！？；!?;\n]?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const piece = m[0]
    if (!piece.trim()) continue
    clauses.push({ start: m.index, end: m.index + piece.length, text: piece })
  }
  if (clauses.length === 0 && text.length > 0) {
    clauses.push({ start: 0, end: text.length, text })
  }
  return clauses
}

function scoreClause(clause: string): { emotion: Emotion; intensity: number } {
  const base = inferEmotionFromText(clause)
  let intensity = 0.25
  let emotion: Emotion = base === 'normal' ? 'normal' : base

  if (STRONG_ANGRY.test(clause)) {
    emotion = 'angry'
    intensity = 0.95
  } else if (STRONG_SORROW.test(clause)) {
    emotion = 'sorrow'
    intensity = 0.85
  } else if (STRONG_SURPRISE.test(clause)) {
    emotion = 'surprise'
    intensity = 0.9
  } else if (STRONG_SMILE.test(clause)) {
    emotion = 'smile'
    intensity = 0.7
  } else if (base === 'smile') {
    emotion = 'smile'
    intensity = 0.4
  } else if (base === 'angry' || base === 'sorrow' || base === 'surprise') {
    // Soft match from inferEmotion — keep but dampen
    emotion = base
    intensity = 0.45
  } else {
    // Mild breathing between normal and soft smile so the face isn't frozen
    emotion = /[吗呢吧~…]|you|please|\?|？/.test(clause) ? 'smile' : 'normal'
    intensity = 0.2
  }

  // Prefer staying calm unless intensity is meaningful
  if (intensity < 0.35 && emotion !== 'smile' && emotion !== 'normal') {
    emotion = 'normal'
    intensity = 0.2
  }

  return { emotion, intensity }
}

/**
 * Build a per-clause emotion timeline for typewriter-driven face changes.
 * Most clauses stay mild; only strong lexical hits jump hard.
 */
export function buildEmotionTimeline(text: string): EmotionCue[] {
  const trimmed = text.trim()
  if (!trimmed) {
    return [{ start: 0, end: 0, emotion: 'normal', intensity: 0 }]
  }

  const clauses = splitClauses(trimmed)
  return clauses.map((c) => {
    const { emotion, intensity } = scoreClause(c.text)
    return {
      start: c.start,
      end: c.end,
      emotion,
      intensity,
    }
  })
}

export function emotionAt(timeline: EmotionCue[], charIndex: number): Emotion {
  if (timeline.length === 0) return 'normal'
  const idx = Math.max(0, charIndex)
  for (let i = timeline.length - 1; i >= 0; i--) {
    const cue = timeline[i]!
    if (idx >= cue.start) return cue.emotion
  }
  return timeline[0]!.emotion
}

export function cueAt(timeline: EmotionCue[], charIndex: number): EmotionCue {
  if (timeline.length === 0) {
    return { start: 0, end: 0, emotion: 'normal', intensity: 0 }
  }
  const idx = Math.max(0, charIndex)
  for (let i = timeline.length - 1; i >= 0; i--) {
    const cue = timeline[i]!
    if (idx >= cue.start) return cue
  }
  return timeline[0]!
}
