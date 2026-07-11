import { create } from 'zustand'
import type { Language, TranslationKey } from '../i18n/translations'
import { t as translate } from '../i18n/translations'

interface LanguageState {
    language: Language
    setLanguage: (lang: Language) => void
    toggleLanguage: () => void
    t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const saved = localStorage.getItem('language') as Language | null

export const useLanguageStore = create<LanguageState>((set, get) => ({
    language: saved === 'en' ? 'en' : 'zh',

    setLanguage: (lang) => {
        localStorage.setItem('language', lang)
        set({ language: lang })
    },

    toggleLanguage: () => {
        const next = get().language === 'zh' ? 'en' : 'zh'
        get().setLanguage(next)
    },

    t: (key, params) => translate(key, get().language, params),
}))

export function useTranslation() {
    const language = useLanguageStore(s => s.language)
    const t = useLanguageStore(s => s.t)
    return { language, t }
}
