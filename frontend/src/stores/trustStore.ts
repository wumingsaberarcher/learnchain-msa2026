import { create } from 'zustand'
import { apiFetch } from '../api/http'

export type TrustStageKey = 'initial' | 'observe' | 'trial' | 'collaborator' | 'core' | string
export type TrustAddressKey = 'trainee' | 'you' | 'commander' | 'callsign' | string

export interface TrustState {
  level: number
  points: number
  stageKey: TrustStageKey
  addressKey: TrustAddressKey
  injectedCount: number
  completedCount: number
  lessonsToStage2: number
  loreKeys: string[]
  affectionTierKey: string
  evaluation: string
  loaded: boolean
  hydrate: () => Promise<void>
  applySnapshot: (partial: Partial<{
    level: number
    points: number
    stageKey: string
    addressKey: string
    injectedCount: number
    completedCount: number
    lessonsToStage2: number
    loreKeys: string[]
    affectionTierKey: string
    evaluation: string
  }>) => void
  clear: () => void
}

const empty: Omit<TrustState, 'hydrate' | 'applySnapshot' | 'clear'> = {
  level: 0,
  points: 0,
  stageKey: 'initial',
  addressKey: 'trainee',
  injectedCount: 0,
  completedCount: 0,
  lessonsToStage2: 3,
  loreKeys: ['coach'],
  affectionTierKey: 'stranger',
  evaluation: '',
  loaded: false,
}

export const useTrustStore = create<TrustState>((set) => ({
  ...empty,

  hydrate: async () => {
    try {
      const res = await apiFetch('/canal/trust')
      if (!res.ok) {
        set({ ...empty, loaded: true })
        return
      }
      const data = await res.json()
      set({
        level: Number(data.level ?? 0),
        points: Number(data.points ?? 0),
        stageKey: String(data.stageKey ?? 'initial'),
        addressKey: String(data.addressKey ?? 'trainee'),
        injectedCount: Number(data.injectedCount ?? 0),
        completedCount: Number(data.completedCount ?? 0),
        lessonsToStage2: Number(data.lessonsToStage2 ?? 3),
        loreKeys: Array.isArray(data.loreKeys) ? data.loreKeys.map(String) : ['coach'],
        affectionTierKey: String(data.affectionTierKey ?? 'stranger'),
        evaluation: String(data.evaluation ?? ''),
        loaded: true,
      })
    } catch {
      set({ ...empty, loaded: true })
    }
  },

  applySnapshot: (partial) => {
    set((s) => ({
      level: partial.level ?? s.level,
      points: partial.points ?? s.points,
      stageKey: (partial.stageKey as TrustStageKey) ?? s.stageKey,
      addressKey: (partial.addressKey as TrustAddressKey) ?? s.addressKey,
      injectedCount: partial.injectedCount ?? s.injectedCount,
      completedCount: partial.completedCount ?? s.completedCount,
      lessonsToStage2: partial.lessonsToStage2 ?? s.lessonsToStage2,
      loreKeys: partial.loreKeys ?? s.loreKeys,
      affectionTierKey: partial.affectionTierKey ?? s.affectionTierKey,
      evaluation: partial.evaluation ?? s.evaluation,
      loaded: true,
    }))
  },

  clear: () => set({ ...empty }),
}))
