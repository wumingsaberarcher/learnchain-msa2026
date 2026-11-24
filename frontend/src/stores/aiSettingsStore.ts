import { create } from 'zustand'

/**
 * Per-account AI preferences (model only).
 * API keys are never stored in the browser or sent to the API —
 * the backend uses server-configured Ai__ApiKey.
 */
const STORAGE_PREFIX = 'learnchain-ai-provider-u:'

const DEFAULTS = {
    model: 'gpt-4o-mini',
} as const

export interface AiSettingsState {
    /** Active account; null when logged out */
    userId: number | null
    model: string
    hydrateForUser: (userId: number | null) => void
    setModel: (v: string) => void
    save: (partial: { model?: string }) => void
}

function storageKey(userId: number) {
    return `${STORAGE_PREFIX}${userId}`
}

function loadForUser(userId: number): Pick<AiSettingsState, 'model'> {
    try {
        const raw = localStorage.getItem(storageKey(userId))
        if (!raw) {
            return { ...DEFAULTS }
        }
        const parsed = JSON.parse(raw) as Partial<typeof DEFAULTS & { apiKey?: string; baseUrl?: string }>
        // Drop any legacy apiKey / baseUrl persisted from older builds.
        const cleaned = { model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULTS.model }
        localStorage.setItem(storageKey(userId), JSON.stringify(cleaned))
        return cleaned
    } catch {
        return { ...DEFAULTS }
    }
}

function persistForUser(userId: number, state: Pick<AiSettingsState, 'model'>) {
    localStorage.setItem(storageKey(userId), JSON.stringify({
        model: state.model,
    }))
}

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
    userId: null,
    ...DEFAULTS,

    hydrateForUser: (userId) => {
        if (userId == null) {
            set({ userId: null, ...DEFAULTS })
            return
        }
        set({ userId, ...loadForUser(userId) })
    },

    setModel: (model) => {
        set({ model })
        const { userId } = get()
        if (userId != null) persistForUser(userId, get())
    },

    save: (partial) => {
        set(state => ({
            model: partial.model ?? state.model,
        }))
        const { userId } = get()
        if (userId != null) persistForUser(userId, get())
    },
}))
