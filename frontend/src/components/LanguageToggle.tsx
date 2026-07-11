import { useLanguageStore } from '../stores/languageStore'

export default function LanguageToggle() {
    const language = useLanguageStore(s => s.language)
    const setLanguage = useLanguageStore(s => s.setLanguage)

    return (
        <button
            type="button"
            className="lang-toggle"
            onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
            aria-label={language === 'zh' ? 'Switch to English' : '切换到中文'}
        >
            <span className={`lang-toggle-label${language === 'zh' ? ' active' : ''}`}>中</span>
            <span className="lang-toggle-track">
                <span className={`lang-toggle-thumb${language === 'en' ? ' en' : ''}`} />
            </span>
            <span className={`lang-toggle-label${language === 'en' ? ' active' : ''}`}>EN</span>
        </button>
    )
}
