/**
 * Canal companion one-liners + never-repeat-within-session cold facts.
 * Idle/focus peeks are ephemeral asides — not formal chat history.
 */

import type { Emotion } from '../components/character/emotionAssets'

export type CompanionScene = 'idle' | 'focus' | 'chat'

const IDLE_MOOD_ZH = [
  '嗯……你还在吗？我有点困了……',
  '盯着屏幕好累啊……不过我还是来看看你。',
  '休息一下也没关系啦……我先眯一会儿。',
  '你动都不动……是睡着了吗？',
  '我探个头……哦，你还在。那就好。',
  '懒得说话了……就这样陪着你也行。',
  '时间过得好慢……再趴一会儿吧。',
  '别急，慢慢来……我也不着急。',
  '哈欠——再陪你待一会儿就好。',
  '世界好安静……我就趴这儿了。',
]

const IDLE_MOOD_EN = [
  'Hmm… are you still there? I’m getting sleepy…',
  'Staring at screens is tiring… still, I came to check on you.',
  'Resting is fine… I’ll doze a little too.',
  'You’re so still… did you fall asleep?',
  'Just peeking… oh, you’re here. Good.',
  'Too lazy to talk much… I’ll just keep you company.',
  'Time crawls… let me lounge a bit longer.',
  'No rush… I’m not in a hurry either.',
  "Yawn—I'll hang around a bit more.",
  'So quiet… I’ll just rest here.',
]

const FOCUS_MOOD_ZH = [
  '加油。我就在这儿看着你。',
  '专注的样子……挺认真的。',
  '别分心，我帮你盯着时间。',
  '做得不错，继续保持这个节奏。',
  '快到预估时间了……再撑一下。',
  '我先躲一会儿，不打扰你。',
  '深呼吸，然后接着做。',
  '你很稳。就这样。',
]

const FOCUS_MOOD_EN = [
  'You’ve got this. I’m watching from here.',
  'You look focused… keep that.',
  'Stay with it — I’ll keep an eye on the clock.',
  'Nice pace. Hold the rhythm.',
  'Near your estimate… one more push.',
  'I’ll duck away so I don’t distract you.',
  'Breathe, then continue.',
  'Steady. Just like that.',
]

/** Geography / ocean / biology / astronomy / weather — short, non-preachy. */
export const COLD_FACTS_ZH = [
  '抹香鲸的脑子大约有人类的五倍重。',
  '地球上约 71% 的表面被海洋覆盖。',
  '章鱼有三颗心脏，两颗专门给鳃供血。',
  '蜂鸟是唯一能向后飞的鸟类。',
  '撒哈拉沙漠里其实有季节性降雪的记录。',
  '一条蓝鲸的舌头可以和一头大象差不多重。',
  '闪电的温度可比太阳表面还烫。',
  '南极洲是世界上最干燥的大陆之一。',
  '海豚睡觉时大脑会轮流休息半边。',
  '竹子是生长最快的植物之一，有的一天能窜高一米。',
  '火星天空在白天偏淡黄油色，日落时会偏蓝。',
  '珊瑚其实是动物，不是植物。',
  '北极熊的皮肤是黑色的，毛发近似透明。',
  '亚马孙河的流量比世界上任何一条河都大。',
  '海獭睡觉时会手拉手，以免漂散开。',
  '长颈鹿每天只需要睡大约半小时左右。',
  '月球在慢慢远离地球，每年大约远几厘米。',
  '鲨鱼比树木更古老——它们比恐龙还早出现。',
  '世界上最大的沙漠其实是南极（冻沙漠）。',
  '萤火虫发光几乎不发热，效率高得惊人。',
  '海马是由雄性怀孕育儿的。',
  '一声雷的回响有时能传出十几公里。',
  '金星自转方向和大多数行星相反。',
  '企鹅其实会在陆地上“飞奔”摔倒再爬起来。',
  '红树林能在盐水里扎根，像海岸的绿篱笆。',
  '北极光其实是带电粒子撞到大气层发的光。',
  '蜗牛可以睡上好几年（极端环境下）。',
  '地球的内核温度和太阳表面差不多一个数量级。',
  '有些水母几乎由水构成，却能发光捕食。',
  '珠穆朗玛峰每年还在缓慢长高一点点。',
  '海星没有大脑，但有一套散布全身的神经网。',
  '雨滴下落时并不是卡通里的眼泪形。',
  '考拉的指纹和人类的很像，曾难倒过鉴定。',
  '土星密度比水还低，理论上能“浮”在巨大浴缸里。',
  '深海鱼有的眼睛大得夸张，为了捉住微光。',
  '蒲公英种子能乘风飞出几十公里。',
  '鳄鱼的舌头没法自由伸出来。',
  '银河系里大约有上千亿颗恒星。',
  '变色龙的舌头常常比身体还长。',
  '太平洋之广，能装下地球上所有陆地还有余。',
]

export const COLD_FACTS_EN = [
  'A sperm whale’s brain can weigh about five times a human’s.',
  'Oceans cover roughly 71% of Earth’s surface.',
  'Octopuses have three hearts — two pump blood to the gills.',
  'Hummingbirds are the only birds that can fly backward.',
  'It has snowed in the Sahara on rare occasions.',
  'A blue whale’s tongue can weigh about as much as an elephant.',
  'A lightning bolt can be hotter than the surface of the Sun.',
  'Antarctica is one of the driest places on Earth.',
  'Dolphins rest one half of their brain at a time.',
  'Some bamboo can grow nearly a meter in a single day.',
  'Martian skies look buttery by day and bluish at sunset.',
  'Coral is an animal, not a plant.',
  'Polar bears have black skin under nearly clear fur.',
  'The Amazon moves more water than any other river.',
  'Sea otters sometimes hold paws while sleeping so they don’t drift apart.',
  'Giraffes often sleep only about half an hour a day.',
  'The Moon drifts a few centimeters farther from Earth each year.',
  'Sharks are older than trees — and older than dinosaurs.',
  'Antarctica is technically the world’s largest desert (a cold one).',
  'Firefly light is almost heatless — wildly efficient.',
  'Male seahorses are the ones that carry the pregnancy.',
  'Thunder can sometimes be heard more than ten kilometers away.',
  'Venus spins the opposite way from most planets.',
  'Penguins belly-flop and scramble on land more than you’d think.',
  'Mangroves root in salt water like living coastal fences.',
  'Auroras are charged particles lighting up the upper air.',
  'Snails can sleep for years in harsh conditions.',
  'Earth’s core is wildly hot — Sun-surface order of magnitude.',
  'Some jellyfish are mostly water and still glow to hunt.',
  'Everest still creeps upward a tiny bit each year.',
  'Starfish have no brain — just a body-wide nerve net.',
  'Raindrops aren’t teardrop-shaped like in cartoons.',
  'Koala fingerprints can look startlingly human.',
  'Saturn is less dense than water — in theory it could float.',
  'Some deep-sea fish have huge eyes to catch faint light.',
  'Dandelion seeds can ride the wind for tens of kilometers.',
  'Crocodiles can’t stick their tongues out freely.',
  'The Milky Way holds on the order of a hundred billion stars.',
  'A chameleon’s tongue is often longer than its body.',
  'The Pacific could hold all of Earth’s land and still have room.',
]

const USED_PREFIX = 'learnchain-companion-used:'

function loadUsed(key: string): number[] {
  try {
    const raw = sessionStorage.getItem(USED_PREFIX + key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : []
  } catch {
    return []
  }
}

function saveUsed(key: string, used: number[]) {
  try {
    sessionStorage.setItem(USED_PREFIX + key, JSON.stringify(used))
  } catch {
    /* ignore quota */
  }
}

/** Pick an index that hasn’t been used this browser tab session; reset when exhausted. */
export function pickUnusedIndex(poolSize: number, bucket: string): number {
  if (poolSize <= 0) return 0
  let used = loadUsed(bucket).filter((i) => i >= 0 && i < poolSize)
  let available = Array.from({ length: poolSize }, (_, i) => i).filter((i) => !used.includes(i))
  if (available.length === 0) {
    used = []
    available = Array.from({ length: poolSize }, (_, i) => i)
  }
  const pick = available[Math.floor(Math.random() * available.length)]!
  used.push(pick)
  saveUsed(bucket, used)
  return pick
}

function pickUnused<T>(pool: readonly T[], bucket: string): T {
  return pool[pickUnusedIndex(pool.length, bucket)]!
}

export function pickColdFact(language: 'zh' | 'en'): string {
  const zh = language.startsWith('zh')
  return pickUnused(zh ? COLD_FACTS_ZH : COLD_FACTS_EN, zh ? 'fact-zh' : 'fact-en')
}

/**
 * Idle: sleepy mood + one cold fact (non-repeating in-session).
 * Focus: short pep talk only (facts would distract).
 */
export function pickCompanionLine(scene: 'idle' | 'focus', language: 'zh' | 'en'): string {
  const zh = language.startsWith('zh')
  if (scene === 'focus') {
    return pickUnused(zh ? FOCUS_MOOD_ZH : FOCUS_MOOD_EN, zh ? 'focus-zh' : 'focus-en')
  }
  const mood = pickUnused(zh ? IDLE_MOOD_ZH : IDLE_MOOD_EN, zh ? 'idle-zh' : 'idle-en')
  const fact = pickColdFact(language)
  return zh ? `${mood} 对了——${fact}` : `${mood} By the way—${fact}`
}

/** Lightweight emotion guess from assistant / companion text. */
export function inferEmotionFromText(text: string): Emotion {
  const s = text.toLowerCase()
  if (/生气|愤怒|angry|怒|烦|讨厌/.test(s)) return 'angry'
  if (/害怕|恐惧|吓|慌|紧张|怕|fear|scared|afraid|terrified|anxious|worry|担心/.test(s)) return 'fear'
  if (/难过|伤心|sorrow|sad|抱歉|对不起|累|困|sleepy|doze|tired/.test(s)) return 'sorrow'
  if (/惊喜|surprise|哇|！{2,}|!{2,}|天哪/.test(s)) return 'surprise'
  if (/开心|哈哈|笑|棒|太好|great|glad|happy|nice|加油|做得好|对了|by the way/.test(s)) return 'smile'
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
