import { create } from 'zustand'
import { apiFetch } from '../api/http'

export type AffectionTierKey = 'stranger' | 'familiar' | 'friend' | 'trust' | 'bond' | 'heart' | string

export interface AffectionState {
  points: number
  maxPoints: number
  tier: number
  tierKey: AffectionTierKey
  gainedToday: number
  dailyCap: number
  toNextTier: number
  loaded: boolean
  hydrate: () => Promise<void>
  applyAward: (partial: {
    awarded?: number
    points?: number
    tierKey?: string
    gainedToday?: number
    dailyCap?: number
  }) => void
  clear: () => void
}

const empty = {
  points: 0,
  maxPoints: 3000,
  tier: 0,
  tierKey: 'stranger' as AffectionTierKey,
  gainedToday: 0,
  dailyCap: 20,
  toNextTier: 100,
  loaded: false,
}

/** Mirror backend CompanionAffectionService.ResolveTier thresholds. */
function toNextTier(points: number): number {
  if (points >= 3000) return 0
  if (points >= 2000) return 3000 - points
  if (points >= 1000) return 2000 - points
  if (points >= 400) return 1000 - points
  if (points >= 100) return 400 - points
  return 100 - points
}

function tierFromPoints(points: number): { tier: number; tierKey: AffectionTierKey } {
  if (points >= 3000) return { tier: 5, tierKey: 'heart' }
  if (points >= 2000) return { tier: 4, tierKey: 'bond' }
  if (points >= 1000) return { tier: 3, tierKey: 'trust' }
  if (points >= 400) return { tier: 2, tierKey: 'friend' }
  if (points >= 100) return { tier: 1, tierKey: 'familiar' }
  return { tier: 0, tierKey: 'stranger' }
}

export const useAffectionStore = create<AffectionState>((set) => ({
  ...empty,

  hydrate: async () => {
    try {
      const res = await apiFetch('/chat/affection')
      if (!res.ok) {
        set({ ...empty, loaded: true })
        return
      }
      const data = await res.json()
      set({
        points: Number(data.points ?? 0),
        maxPoints: Number(data.maxPoints ?? 3000),
        tier: Number(data.tier ?? 0),
        tierKey: String(data.tierKey ?? 'stranger'),
        gainedToday: Number(data.gainedToday ?? 0),
        dailyCap: Number(data.dailyCap ?? 20),
        toNextTier: Number(data.toNextTier ?? 0),
        loaded: true,
      })
    } catch {
      set({ ...empty, loaded: true })
    }
  },

  applyAward: (partial) => {
    set((s) => {
      const points = partial.points ?? s.points
      const derived = tierFromPoints(points)
      return {
        points,
        tier: derived.tier,
        tierKey: (partial.tierKey as AffectionTierKey) ?? derived.tierKey,
        gainedToday: partial.gainedToday ?? s.gainedToday,
        dailyCap: partial.dailyCap ?? s.dailyCap,
        toNextTier: toNextTier(points),
        loaded: true,
      }
    })
  },

  clear: () => set({ ...empty }),
}))
