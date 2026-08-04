import { create } from 'zustand'

/**
 * Per-account AI provider settings (API key / base URL / model).
 * Stored as `learnchain-ai-provider-u:<userId>` in localStorage.
 * The old shared key `learnchain-ai-provider` is intentionally not migrated,
 * so new accounts do not inherit another user's key on the same browser.
 */
const STORAGE_PREFIX = 'learnchain-ai-provider-u:'

const DEFAULTS = {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
} as const

export interface AiSettingsState {
    /** Active account; null when logged out */
    userId: number | null
    apiKey: string
    baseUrl: string
    model: string
    hydrateForUser: (userId: number | null) => void
    setApiKey: (v: string) => void
    setBaseUrl: (v: string) => void
    setModel: (v: string) => void
    save: (partial: { apiKey?: string; baseUrl?: string; model?: string }) => void
}

function storageKey(userId: number) {
    return `${STORAGE_PREFIX}${userId}`
}

function loadForUser(userId: number): Pick<AiSettingsState, 'apiKey' | 'baseUrl' | 'model'> {
    try {
        const raw = localStorage.getItem(storageKey(userId))
        if (!raw) {
            return { ...DEFAULTS }
        }
        const parsed = JSON.parse(raw) as Partial<typeof DEFAULTS>
        return {
            apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
            baseUrl: parsed.baseUrl || DEFAULTS.baseUrl,
            model: parsed.model || DEFAULTS.model,
        }
    } catch {
        return { ...DEFAULTS }
    }
}

function persistForUser(userId: number, state: Pick<AiSettingsState, 'apiKey' | 'baseUrl' | 'model'>) {
    localStorage.setItem(storageKey(userId), JSON.stringify({
        apiKey: state.apiKey,
        baseUrl: state.baseUrl,
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

    setApiKey: (apiKey) => {
        set({ apiKey })
        const { userId } = get()
        if (userId != null) persistForUser(userId, get())
    },
    setBaseUrl: (baseUrl) => {
        set({ baseUrl })
        const { userId } = get()
        if (userId != null) persistForUser(userId, get())
    },
    setModel: (model) => {
        set({ model })
        const { userId } = get()
        if (userId != null) persistForUser(userId, get())
    },
    save: (partial) => {
        set(partial)
        const { userId } = get()
        if (userId != null) persistForUser(userId, get())
    },
}))
