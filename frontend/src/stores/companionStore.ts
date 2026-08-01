import { create } from 'zustand'
import type { Emotion } from '../components/character/emotionAssets'
import { inferEmotionFromText } from '../companions/companionLines'

const AVATAR_KEY = 'learnchain-user-avatar-v1'
const MAX_AVATAR_BYTES = 450_000

function loadAvatar(): string | null {
  try {
    const raw = localStorage.getItem(AVATAR_KEY)
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
  emotion: Emotion
  isTalking: boolean
  userAvatarUrl: string | null
  setEmotion: (emotion: Emotion, talking?: boolean) => void
  reactToText: (text: string, talking?: boolean) => void
  setUserAvatarFromFile: (file: File) => Promise<void>
  clearUserAvatar: () => void
}

export const useCompanionStore = create<CompanionState>((set) => ({
  emotion: 'normal',
  isTalking: false,
  userAvatarUrl: loadAvatar(),

  setEmotion: (emotion, talking = false) => set({ emotion, isTalking: talking }),

  reactToText: (text, talking = true) => {
    set({ emotion: inferEmotionFromText(text), isTalking: talking })
  },

  setUserAvatarFromFile: async (file) => {
    if (!file.type.startsWith('image/')) throw new Error('not_image')
    const dataUrl = await compressImage(file)
    localStorage.setItem(AVATAR_KEY, dataUrl)
    set({ userAvatarUrl: dataUrl })
  },

  clearUserAvatar: () => {
    localStorage.removeItem(AVATAR_KEY)
    set({ userAvatarUrl: null })
  },
}))
