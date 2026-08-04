import type { Emotion } from '../components/character/emotionAssets'

export type TeaseKind = 'praise' | 'scold'

export interface TeasePayload {
  delta: number
  line: string
  emotion: Emotion
  kind: TeaseKind
}

/** Fake affection deltas — mischievous only, never touch real bond points. */
const ROUTE_TEASES: Record<string, Array<Omit<TeasePayload, 'kind'>>> = {
  '/': [
    { delta: 1, line: '看板也要认真看哦……好感度 +1！（骗你的）', emotion: 'smile' },
    { delta: -1, line: '发呆被我抓到了。好感度 -1～（假的啦）', emotion: 'angry' },
  ],
  '/habits': [
    { delta: 3, line: '来打卡了？好感度 +3！……才不会真加呢。', emotion: 'smile' },
    { delta: 2, line: '链条还在，我就放心一点。好感度 +2（恶作剧）', emotion: 'normal' },
  ],
  '/music': [
    { delta: 5, line: '品味不错嘛。好感度 +5！（记分板上没有这回事）', emotion: 'smile' },
    { delta: -2, line: '把音量开太大了吧？好感度 -2～开玩笑的。', emotion: 'fear' },
  ],
  '/profile': [
    { delta: 1, line: '改资料？记得我也在看着。好感度 +1（假）', emotion: 'normal' },
  ],
  '/achievements': [
    { delta: 4, line: '徽章闪闪的……好感度 +4！我随口说说。', emotion: 'surprise' },
  ],
  '/about': [
    { delta: 2, line: '来看关于页？好感度 +2（虚构）', emotion: 'smile' },
  ],
}

const EN_ROUTE: Record<string, Array<Omit<TeasePayload, 'kind'>>> = {
  '/': [
    { delta: 1, line: 'Reading the board carefully? Affinity +1! (jk)', emotion: 'smile' },
    { delta: -1, line: 'Caught you zoning out. Affinity −1~ (fake)', emotion: 'angry' },
  ],
  '/habits': [
    { delta: 3, line: 'Here to check in? Affinity +3! …not really.', emotion: 'smile' },
    { delta: 2, line: 'Chain’s alive — Affinity +2 (prank)', emotion: 'normal' },
  ],
  '/music': [
    { delta: 5, line: 'Nice taste. Affinity +5! (not on the real meter)', emotion: 'smile' },
    { delta: -2, line: 'Volume too loud? Affinity −2~ kidding.', emotion: 'fear' },
  ],
  '/profile': [
    { delta: 1, line: 'Tweaking your profile? Affinity +1 (fake)', emotion: 'normal' },
  ],
  '/achievements': [
    { delta: 4, line: 'Badges sparkle… Affinity +4! I made that up.', emotion: 'surprise' },
  ],
  '/about': [
    { delta: 2, line: 'Visiting About? Affinity +2 (fiction)', emotion: 'smile' },
  ],
}

const RAPID_ZH: Omit<TeasePayload, 'kind'> = {
  delta: -5,
  line: '点太快了！好感度 -5！……吓你的。',
  emotion: 'angry',
}

const RAPID_EN: Omit<TeasePayload, 'kind'> = {
  delta: -5,
  line: 'Too many clicks! Affinity −5! …gotcha.',
  emotion: 'angry',
}

function withKind(p: Omit<TeasePayload, 'kind'>): TeasePayload {
  return { ...p, kind: p.delta >= 0 ? 'praise' : 'scold' }
}

export function pickRouteTease(pathname: string, language: string): TeasePayload | null {
  const key = pathname.startsWith('/admin') ? null : (pathname.split('?')[0] || '/')
  if (!key) return null
  const pool = (language.startsWith('zh') ? ROUTE_TEASES : EN_ROUTE)[key]
  if (!pool?.length) return null
  return withKind(pool[Math.floor(Math.random() * pool.length)]!)
}

export function pickRapidTease(language: string): TeasePayload {
  return withKind(language.startsWith('zh') ? RAPID_ZH : RAPID_EN)
}
