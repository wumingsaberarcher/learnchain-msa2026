import { create } from 'zustand'
import type { Language } from '../i18n/translations'
import { t as translate } from '../i18n/translations'
import type { Theme } from './settingsStore'
import { useSettingsStore } from './settingsStore'

const STORAGE_KEY = 'learnchain-rest-slogans'

/** Idle timeout before the rest screen appears (ms). */
export const IDLE_REST_MS = 90_000

function loadCustom(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.map(String).map(s => s.trim()).filter(Boolean)
    } catch {
        return []
    }
}

function builtinQuotes(lang: Language): string[] {
    return [
        translate('dash.persistSub', lang),
        translate('motivation.default1', lang),
        translate('motivation.default2', lang),
        translate('motivation.default3', lang),
        translate('rest.builtin1', lang),
        translate('rest.builtin2', lang),
    ]
}

interface IdleRestState {
    isResting: boolean
    frozenTheme: Theme
    frozenLanguage: Language
    sessionTitle: string
    sessionQuote: string
    customSlogans: string[]
    enterRest: () => void
    leaveRest: () => void
    setCustomSlogans: (lines: string[]) => void
}

export const useIdleRestStore = create<IdleRestState>((set, get) => ({
    isResting: false,
    frozenTheme: 'night',
    frozenLanguage: 'zh',
    sessionTitle: '',
    sessionQuote: '',
    customSlogans: loadCustom(),

    enterRest: () => {
        const { theme, language } = useSettingsStore.getState()
        const custom = get().customSlogans
        const pool = [...custom, ...builtinQuotes(language)].filter(Boolean)
        const quote = pool[Math.floor(Math.random() * pool.length)]
            || translate('dash.persistSub', language)

        set({
            isResting: true,
            frozenTheme: theme,
            frozenLanguage: language,
            sessionTitle: translate('dash.persist', language),
            sessionQuote: quote,
        })
    },

    leaveRest: () => set({ isResting: false }),

    setCustomSlogans: (lines) => {
        const cleaned = lines.map(s => s.trim()).filter(Boolean)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
        set({ customSlogans: cleaned })
    },
}))
