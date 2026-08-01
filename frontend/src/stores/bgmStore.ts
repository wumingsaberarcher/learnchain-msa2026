import { create } from 'zustand'
import { BADGE_DEFINITIONS } from '../badges/badgeDefinitions'
import {
    idbDeleteTrack,
    idbGetBlob,
    idbListTracks,
    idbPutTrack,
} from '../utils/bgmUserLibrary'

export type BuiltinTrackId = 'ceta' | 'faster-than-light' | 'waiting-for-the-sun'
export type BgmTrackId = string

export interface BgmTrack {
    id: BgmTrackId
    title: string
    /** Builtin server filename */
    file?: string
    kind: 'builtin' | 'user'
    defaultUnlocked: boolean
    /** Runtime object URL for user uploads */
    objectUrl?: string
}

export const BGM_TRACKS: BgmTrack[] = [
    { id: 'ceta', title: 'CETA', file: 'ceta.aac', kind: 'builtin', defaultUnlocked: true },
    { id: 'faster-than-light', title: 'Faster Than Light', file: 'faster-than-light.aac', kind: 'builtin', defaultUnlocked: false },
    { id: 'waiting-for-the-sun', title: 'Waiting for the Sun', file: 'waiting-for-the-sun.aac', kind: 'builtin', defaultUnlocked: false },
]

const STORAGE_KEY = 'learnchain-bgm-v2'
const DEFAULT_VOLUME = 0.28
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

interface PersistedBgm {
    trackId: BgmTrackId
    unlocked: BgmTrackId[]
    volume: number
    muted: boolean
    userPicked: boolean
    celebratedAllBadges: boolean
}

function loadPersisted(): PersistedBgm {
    try {
        const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('learnchain-bgm-v1')
        if (!raw) throw new Error('empty')
        const parsed = JSON.parse(raw) as Partial<PersistedBgm>
        const unlocked = new Set<BgmTrackId>(['ceta', ...(parsed.unlocked ?? [])])
        return {
            trackId: typeof parsed.trackId === 'string' && parsed.trackId ? parsed.trackId : 'ceta',
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
    userTracks: BgmTrack[]
    libraryReady: boolean
    setSidebarOpen: (open: boolean) => void
    toggleSidebar: () => void
    setPlaying: (playing: boolean) => void
    setNeedsGesture: (v: boolean) => void
    setVolume: (v: number) => void
    setMuted: (v: boolean) => void
    selectTrack: (id: BgmTrackId, fromUser: boolean) => boolean
    unlockAllBadgeTracks: () => { justUnlockedHidden: boolean }
    isUnlocked: (id: BgmTrackId) => boolean
    hydrateUserLibrary: () => Promise<void>
    addUserTrack: (file: File, title?: string) => Promise<BgmTrack>
    removeUserTrack: (id: BgmTrackId) => Promise<void>
    resolveTrackSrc: (id: BgmTrackId) => Promise<string | null>
    getTrack: (id: BgmTrackId) => BgmTrack | undefined
    allTracks: () => BgmTrack[]
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
const objectUrls = new Map<string, string>()

function revokeUrl(id: string) {
    const url = objectUrls.get(id)
    if (url) {
        URL.revokeObjectURL(url)
        objectUrls.delete(id)
    }
}

export const useBgmStore = create<BgmState>((set, get) => ({
    ...initial,
    sidebarOpen: false,
    isPlaying: false,
    needsGesture: true,
    userTracks: [],
    libraryReady: false,

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

    isUnlocked: (id) => {
        if (id.startsWith('user:')) return true
        return get().unlocked.includes(id)
    },

    getTrack: (id) => get().allTracks().find(t => t.id === id),

    allTracks: () => [...BGM_TRACKS, ...get().userTracks],

    selectTrack: (id, fromUser) => {
        if (!get().isUnlocked(id)) return false
        if (!get().getTrack(id)) return false
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
        const unlocked = [...nextUnlocked]

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

    hydrateUserLibrary: async () => {
        try {
            const rows = await idbListTracks()
            for (const url of objectUrls.values()) URL.revokeObjectURL(url)
            objectUrls.clear()

            const userTracks: BgmTrack[] = rows
                .sort((a, b) => a.createdAt - b.createdAt)
                .map(row => {
                    const objectUrl = URL.createObjectURL(row.blob)
                    objectUrls.set(row.id, objectUrl)
                    return {
                        id: row.id,
                        title: row.title,
                        kind: 'user' as const,
                        defaultUnlocked: true,
                        objectUrl,
                    }
                })

            set({ userTracks, libraryReady: true })

            const { trackId } = get()
            if (!get().getTrack(trackId)) {
                get().selectTrack('ceta', false)
            }
        } catch {
            set({ userTracks: [], libraryReady: true })
        }
    },

    addUserTrack: async (file, title) => {
        if (!file.type.startsWith('audio/') && !/\.(mp3|aac|m4a|wav|ogg|flac|webm)$/i.test(file.name)) {
            throw new Error('unsupported')
        }
        if (file.size > MAX_UPLOAD_BYTES) {
            throw new Error('too_large')
        }

        const id = `user:${crypto.randomUUID()}`
        const cleanTitle = (title?.trim() || file.name.replace(/\.[^.]+$/, '') || 'My track').slice(0, 80)
        await idbPutTrack(id, cleanTitle, file)
        const objectUrl = URL.createObjectURL(file)
        objectUrls.set(id, objectUrl)
        const track: BgmTrack = {
            id,
            title: cleanTitle,
            kind: 'user',
            defaultUnlocked: true,
            objectUrl,
        }
        set(s => ({ userTracks: [...s.userTracks, track] }))
        get().selectTrack(id, true)
        return track
    },

    removeUserTrack: async (id) => {
        if (!id.startsWith('user:')) return
        await idbDeleteTrack(id)
        revokeUrl(id)
        const nextTracks = get().userTracks.filter(t => t.id !== id)
        set({ userTracks: nextTracks })
        if (get().trackId === id) {
            get().selectTrack('ceta', true)
        }
    },

    resolveTrackSrc: async (id) => {
        const track = get().getTrack(id)
        if (!track) return null
        if (track.kind === 'builtin' && track.file) return bgmTrackUrl(track.file)
        if (track.objectUrl) return track.objectUrl
        const blob = await idbGetBlob(id)
        if (!blob) return null
        const url = URL.createObjectURL(blob)
        objectUrls.set(id, url)
        set(s => ({
            userTracks: s.userTracks.map(t => (t.id === id ? { ...t, objectUrl: url } : t)),
        }))
        return url
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
    if (/^https?:\/\//i.test(apiBase)) {
        const origin = apiBase.replace(/\/api\/?$/, '')
        return `${origin}/music/${file}`
    }
    return `/music/${file}`
}

export const MAX_BGM_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024)
