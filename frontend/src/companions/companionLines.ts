import type { Emotion } from '../components/character/emotionAssets'

export type CompanionScene = 'idle' | 'focus' | 'chat'

const IDLE_ZH = [
  '嗯……你还在吗？我有点困了……',
  '盯着屏幕好累啊……不过我还是来看看你。',
  '休息一下也没关系啦……我先眯一会儿。',
  '你动都不动……是睡着了吗？',
  '我探个头……哦，你还在。那就好。',
  '懒得说话了……就这样陪着你也行。',
  '时间过得好慢……再趴一会儿吧。',
  '别急，慢慢来……我也不着急。',
]

const IDLE_EN = [
  'Hmm… are you still there? I’m getting sleepy…',
  'Staring at screens is tiring… still, I came to check on you.',
  'Resting is fine… I’ll doze a little too.',
  'You’re so still… did you fall asleep?',
  'Just peeking… oh, you’re here. Good.',
  'Too lazy to talk much… I’ll just keep you company.',
  'Time crawls… let me lounge a bit longer.',
  'No rush… I’m not in a hurry either.',
]

const FOCUS_ZH = [
  '加油。我就在这儿看着你。',
  '专注的样子……挺认真的。',
  '别分心，我帮你盯着时间。',
  '做得不错，继续保持这个节奏。',
  '快到预估时间了……再撑一下。',
  '我先躲一会儿，不打扰你。',
  '深呼吸，然后接着做。',
  '你很稳。就这样。',
]

const FOCUS_EN = [
  'You’ve got this. I’m watching from here.',
  'You look focused… keep that.',
  'Stay with it — I’ll keep an eye on the clock.',
  'Nice pace. Hold the rhythm.',
  'Near your estimate… one more push.',
  'I’ll duck away so I don’t distract you.',
  'Breathe, then continue.',
  'Steady. Just like that.',
]

export function pickCompanionLine(scene: 'idle' | 'focus', language: 'zh' | 'en'): string {
  const pool = scene === 'idle'
    ? (language.startsWith('zh') ? IDLE_ZH : IDLE_EN)
    : (language.startsWith('zh') ? FOCUS_ZH : FOCUS_EN)
  return pool[Math.floor(Math.random() * pool.length)]!
}

/** Lightweight emotion guess from assistant / companion text. */
export function inferEmotionFromText(text: string): Emotion {
  const s = text.toLowerCase()
  if (/生气|愤怒|angry|怒|烦|讨厌/.test(s)) return 'angry'
  if (/害怕|恐惧|吓|慌|紧张|怕|fear|scared|afraid|terrified|anxious|worry|担心/.test(s)) return 'fear'
  if (/难过|伤心|sorrow|sad|抱歉|对不起|累|困/.test(s)) return 'sorrow'
  if (/惊喜|surprise|哇|！{2,}|!{2,}|天哪/.test(s)) return 'surprise'
  if (/开心|哈哈|笑|棒|太好|great|glad|happy|nice|加油|做得好/.test(s)) return 'smile'
  return 'normal'
}

export function randomIdleEmotion(): Emotion {
  const pool: Emotion[] = ['normal', 'sorrow', 'sorrow', 'normal', 'smile']
  return pool[Math.floor(Math.random() * pool.length)]!
}

export function randomFocusEmotion(): Emotion {
  const pool: Emotion[] = ['normal', 'normal', 'smile', 'normal']
  return pool[Math.floor(Math.random() * pool.length)]!
}
