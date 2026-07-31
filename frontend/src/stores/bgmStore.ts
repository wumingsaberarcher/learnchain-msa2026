import { create } from 'zustand'
import { BADGE_DEFINITIONS } from '../badges/badgeDefinitions'

export type BgmTrackId = 'ceta' | 'faster-than-light' | 'waiting-for-the-sun'

export interface BgmTrack {
    id: BgmTrackId
    title: string
    file: string
    /** Unlocked from the start */
    defaultUnlocked: boolean
}

export const BGM_TRACKS: BgmTrack[] = [
    { id: 'ceta', title: 'CETA', file: 'ceta.aac', defaultUnlocked: true },
    { id: 'faster-than-light', title: 'Faster Than Light', file: 'faster-than-light.aac', defaultUnlocked: false },
    { id: 'waiting-for-the-sun', title: 'Waiting for the Sun', file: 'waiting-for-the-sun.aac', defaultUnlocked: false },
]

const STORAGE_KEY = 'learnchain-bgm-v1'
const DEFAULT_VOLUME = 0.28

interface PersistedBgm {
    trackId: BgmTrackId
    unlocked: BgmTrackId[]
    volume: number
    muted: boolean
    /** User manually picked a track after hidden unlock — stop forcing Waiting for the Sun */
    userPicked: boolean
    /** Already auto-switched to Waiting for the Sun once */
    celebratedAllBadges: boolean
}

function loadPersisted(): PersistedBgm {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) throw new Error('empty')
        const parsed = JSON.parse(raw) as Partial<PersistedBgm>
        const unlocked = new Set<BgmTrackId>(['ceta', ...(parsed.unlocked ?? [])])
        const trackId = (BGM_TRACKS.some(t => t.id === parsed.trackId)
            ? parsed.trackId
            : 'ceta') as BgmTrackId
        return {
            trackId,
            unlocked: [...unlocked],
            volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_VOLUME,
            muted: !!parsed.muted,
            userPicked: !!parsed.userPicked,
            celebratedAllBadges: !!parsed.celebratedAllBadges,
        }
    } catch {
        return {
            trackId: 'ceta',
            unlocked: ['ceta'],
            volume: DEFAULT_VOLUME,
            muted: false,
            userPicked: false,
            celebratedAllBadges: false,
        }
    }
}

interface BgmState extends PersistedBgm {
    sidebarOpen: boolean
    isPlaying: boolean
    needsGesture: boolean
    setSidebarOpen: (open: boolean) => void
    toggleSidebar: () => void
    setPlaying: (playing: boolean) => void
    setNeedsGesture: (v: boolean) => void
    setVolume: (v: number) => void
    setMuted: (v: boolean) => void
    selectTrack: (id: BgmTrackId, fromUser: boolean) => boolean
    unlockAllBadgeTracks: () => { justUnlockedHidden: boolean }
    isUnlocked: (id: BgmTrackId) => boolean
    persist: () => void
}

function persistSlice(s: PersistedBgm) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        trackId: s.trackId,
        unlocked: s.unlocked,
        volume: s.volume,
        muted: s.muted,
        userPicked: s.userPicked,
        celebratedAllBadges: s.celebratedAllBadges,
    }))
}

const initial = loadPersisted()

export const useBgmStore = create<BgmState>((set, get) => ({
    ...initial,
    sidebarOpen: false,
    isPlaying: false,
    needsGesture: true,

    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
    setPlaying: (playing) => set({ isPlaying: playing }),
    setNeedsGesture: (v) => set({ needsGesture: v }),

    setVolume: (v) => {
        const volume = Math.min(1, Math.max(0, v))
        set({ volume })
        persistSlice({ ...get(), volume })
    },

    setMuted: (muted) => {
        set({ muted })
        persistSlice({ ...get(), muted })
    },

    isUnlocked: (id) => get().unlocked.includes(id),

    selectTrack: (id, fromUser) => {
        if (!get().unlocked.includes(id)) return false
        const userPicked = fromUser ? true : get().userPicked
        const next = { ...get(), trackId: id, userPicked }
        set({ trackId: id, userPicked })
        persistSlice(next)
        return true
    },

    unlockAllBadgeTracks: () => {
        const state = get()
        const nextUnlocked = new Set(state.unlocked)
        let changed = false
        for (const t of BGM_TRACKS) {
            if (!t.defaultUnlocked && !nextUnlocked.has(t.id)) {
                nextUnlocked.add(t.id)
                changed = true
            }
        }

        const justUnlockedHidden = changed && !state.celebratedAllBadges
        const unlocked = [...nextUnlocked] as BgmTrackId[]

        if (justUnlockedHidden) {
            set({
                unlocked,
                trackId: 'waiting-for-the-sun',
                celebratedAllBadges: true,
                userPicked: false,
            })
            persistSlice({
                ...state,
                unlocked,
                trackId: 'waiting-for-the-sun',
                celebratedAllBadges: true,
                userPicked: false,
            })
            return { justUnlockedHidden: true }
        }

        if (changed) {
            set({ unlocked })
            persistSlice({ ...state, unlocked })
        }
        return { justUnlockedHidden: false }
    },

    persist: () => persistSlice(get()),
}))

export function hasAllBadgesUnlocked(achievements: { badgeId: string; unlocked: boolean }[]): boolean {
    if (achievements.length === 0) return false
    const unlocked = new Set(achievements.filter(a => a.unlocked).map(a => a.badgeId))
    return BADGE_DEFINITIONS.every(b => unlocked.has(b.id))
}

/** Resolve audio URL — prefers same-origin /music (Vite proxy / Vercel rewrite). */
export function bgmTrackUrl(file: string): string {
    const apiBase = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')
    // If API is absolute Render URL, music lives on same host without /api prefix.
    if (/^https?:\/\//i.test(apiBase)) {
        const origin = apiBase.replace(/\/api\/?$/, '')
        return `${origin}/music/${file}`
    }
    return `/music/${file}`
}
