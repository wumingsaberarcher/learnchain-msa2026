import { create } from 'zustand'

const STORAGE_KEY = 'learnchain-ai-provider'

export interface AiSettingsState {
    apiKey: string
    baseUrl: string
    model: string
    setApiKey: (v: string) => void
    setBaseUrl: (v: string) => void
    setModel: (v: string) => void
    save: (partial: { apiKey?: string; baseUrl?: string; model?: string }) => void
}

function load(): Pick<AiSettingsState, 'apiKey' | 'baseUrl' | 'model'> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return {
                apiKey: '',
                baseUrl: 'https://api.openai.com/v1',
                model: 'gpt-4o-mini',
            }
        }
        const parsed = JSON.parse(raw) as Partial<AiSettingsState>
        return {
            apiKey: parsed.apiKey ?? '',
            baseUrl: parsed.baseUrl || 'https://api.openai.com/v1',
            model: parsed.model || 'gpt-4o-mini',
        }
    } catch {
        return {
            apiKey: '',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
        }
    }
}

function persist(state: Pick<AiSettingsState, 'apiKey' | 'baseUrl' | 'model'>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        apiKey: state.apiKey,
        baseUrl: state.baseUrl,
        model: state.model,
    }))
}

const initial = load()

export const useAiSettingsStore = create<AiSettingsState>((set, get) => ({
    ...initial,

    setApiKey: (apiKey) => {
        set({ apiKey })
        persist(get())
    },
    setBaseUrl: (baseUrl) => {
        set({ baseUrl })
        persist(get())
    },
    setModel: (model) => {
        set({ model })
        persist(get())
    },
    save: (partial) => {
        set(partial)
        persist(get())
    },
}))
