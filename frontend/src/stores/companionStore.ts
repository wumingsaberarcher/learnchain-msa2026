import { create } from 'zustand'
import type { Emotion } from '../components/character/emotionAssets'
import { inferEmotionFromText } from '../companions/companionLines'

const MAX_AVATAR_BYTES = 450_000

function scopedKey(userId: number, name: string) {
  return `learnchain-canal-${name}-u:${userId}`
}

function loadFlag(userId: number, name: string): boolean {
  try {
    return localStorage.getItem(scopedKey(userId, name)) === '1'
  } catch {
    return false
  }
}

function saveFlag(userId: number, name: string, value: boolean) {
  try {
    const key = scopedKey(userId, name)
    if (value) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function loadAvatar(userId: number): string | null {
  try {
    const raw = localStorage.getItem(scopedKey(userId, 'avatar'))
    return raw && raw.startsWith('data:') ? raw : null
  } catch {
    return null
  }
}

function compressImage(file: File, maxSide = 256, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('canvas'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      if (dataUrl.length > MAX_AVATAR_BYTES) {
        reject(new Error('too_large'))
        return
      }
      resolve(dataUrl)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode'))
    }
    img.src = url
  })
}

interface CompanionState {
  userId: number | null
  emotion: Emotion
  isTalking: boolean
  userAvatarUrl: string | null
  hasAvatarHoverSurprised: boolean
  hasEnteredGalMode: boolean
  galModeOpen: boolean
  galSmokePlaying: boolean
  hydrateForUser: (userId: number | null) => void
  setEmotion: (emotion: Emotion, talking?: boolean) => void
  reactToText: (text: string, talking?: boolean) => void
  tryHoverSurprise: () => void
  enterGalMode: () => void
  exitGalMode: () => void
  clearGalSmoke: () => void
  setUserAvatarFromFile: (file: File) => Promise<void>
  clearUserAvatar: () => void
}

export const useCompanionStore = create<CompanionState>((set, get) => ({
  userId: null,
  emotion: 'normal',
  isTalking: false,
  userAvatarUrl: null,
  hasAvatarHoverSurprised: false,
  hasEnteredGalMode: false,
  galModeOpen: false,
  galSmokePlaying: false,

  hydrateForUser: (userId) => {
    if (userId == null) {
      set({
        userId: null,
        emotion: 'normal',
        isTalking: false,
        userAvatarUrl: null,
        hasAvatarHoverSurprised: false,
        hasEnteredGalMode: false,
        galModeOpen: false,
        galSmokePlaying: false,
      })
      return
    }
    set({
      userId,
      emotion: 'normal',
      isTalking: false,
      userAvatarUrl: loadAvatar(userId),
      hasAvatarHoverSurprised: loadFlag(userId, 'hover'),
      hasEnteredGalMode: loadFlag(userId, 'gal'),
      galModeOpen: false,
      galSmokePlaying: false,
    })
  },

  setEmotion: (emotion, talking = false) => set({ emotion, isTalking: talking }),

  reactToText: (text, talking = true) => {
    set({ emotion: inferEmotionFromText(text), isTalking: talking })
  },

  tryHoverSurprise: () => {
    const { userId, hasAvatarHoverSurprised, hasEnteredGalMode } = get()
    if (userId == null || hasAvatarHoverSurprised || hasEnteredGalMode) return
    saveFlag(userId, 'hover', true)
    set({
      hasAvatarHoverSurprised: true,
      emotion: 'surprise',
      isTalking: false,
    })
  },

  enterGalMode: () => {
    const { userId } = get()
    if (userId != null) saveFlag(userId, 'gal', true)
    set({
      hasEnteredGalMode: true,
      galModeOpen: true,
      galSmokePlaying: true,
      emotion: 'normal',
      isTalking: false,
    })
  },

  exitGalMode: () => {
    set({
      galModeOpen: false,
      galSmokePlaying: false,
      isTalking: false,
      emotion: 'normal',
    })
  },

  clearGalSmoke: () => set({ galSmokePlaying: false }),

  setUserAvatarFromFile: async (file) => {
    const { userId } = get()
    if (userId == null) throw new Error('not_logged_in')
    if (!file.type.startsWith('image/')) throw new Error('not_image')
    const dataUrl = await compressImage(file)
    localStorage.setItem(scopedKey(userId, 'avatar'), dataUrl)
    set({ userAvatarUrl: dataUrl })
  },

  clearUserAvatar: () => {
    const { userId } = get()
    if (userId != null) localStorage.removeItem(scopedKey(userId, 'avatar'))
    set({ userAvatarUrl: null })
  },
}))
