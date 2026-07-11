import { create } from 'zustand'
import type { Language, TranslationKey } from '../i18n/translations'
import { t as translate } from '../i18n/translations'

export type Theme = 'day' | 'night'
export type Corner = 'bl' | 'br' | 'tl' | 'tr'

const CORNER_MAP: Record<Corner, { language: Language; theme: Theme }> = {
    bl: { language: 'zh', theme: 'night' },
    br: { language: 'en', theme: 'night' },
    tl: { language: 'zh', theme: 'day' },
    tr: { language: 'en', theme: 'day' },
}

interface SettingsState {
    corner: Corner
    language: Language
    theme: Theme
    setCorner: (corner: Corner) => void
    t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const savedCorner = localStorage.getItem('settingsCorner') as Corner | null
const validCorners: Corner[] = ['bl', 'br', 'tl', 'tr']
const initialCorner: Corner = savedCorner && validCorners.includes(savedCorner) ? savedCorner : 'bl'
const initial = CORNER_MAP[initialCorner]

export const useSettingsStore = create<SettingsState>((set, get) => ({
    corner: initialCorner,
    language: initial.language,
    theme: initial.theme,

    setCorner: (corner) => {
        const { language, theme } = CORNER_MAP[corner]
        localStorage.setItem('settingsCorner', corner)
        localStorage.setItem('language', language)
        document.documentElement.setAttribute('data-theme', theme)
        document.documentElement.setAttribute('data-lang', language)
        set({ corner, language, theme })
    },

    t: (key, params) => translate(key, get().language, params),
}))

// Apply on load
document.documentElement.setAttribute('data-theme', initial.theme)
document.documentElement.setAttribute('data-lang', initial.language)

export function useTranslation() {
    const language = useSettingsStore(s => s.language)
    const theme = useSettingsStore(s => s.theme)
    const corner = useSettingsStore(s => s.corner)
    const t = useSettingsStore(s => s.t)
    return { language, theme, corner, t }
}

// Backward compatibility
export const useLanguageStore = useSettingsStore
