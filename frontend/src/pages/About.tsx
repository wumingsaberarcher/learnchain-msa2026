import {
    Bot,
    Flame,
    Info,
    Layers,
    Moon,
    Sparkles,
    Target,
    Timer,
    Trophy,
    UserRound,
} from 'lucide-react'
import { useTranslation } from '../stores/settingsStore'

const FEATURES = [
    { icon: Target, titleKey: 'about.feature.checkinTitle' as const, descKey: 'about.feature.checkinDesc' as const },
    { icon: Flame, titleKey: 'about.feature.streakTitle' as const, descKey: 'about.feature.streakDesc' as const },
    { icon: Trophy, titleKey: 'about.feature.xpTitle' as const, descKey: 'about.feature.xpDesc' as const },
    { icon: Sparkles, titleKey: 'about.feature.badgeTitle' as const, descKey: 'about.feature.badgeDesc' as const },
    { icon: Timer, titleKey: 'about.feature.focusTitle' as const, descKey: 'about.feature.focusDesc' as const },
    { icon: Bot, titleKey: 'about.feature.aiTitle' as const, descKey: 'about.feature.aiDesc' as const },
    { icon: UserRound, titleKey: 'about.feature.profileTitle' as const, descKey: 'about.feature.profileDesc' as const },
    { icon: Moon, titleKey: 'about.feature.themeTitle' as const, descKey: 'about.feature.themeDesc' as const },
]

const TECH = [
    { name: 'React', roleKey: 'about.tech.react' as const },
    { name: 'TypeScript', roleKey: 'about.tech.ts' as const },
    { name: 'React Router', roleKey: 'about.tech.router' as const },
    { name: 'Zustand', roleKey: 'about.tech.zustand' as const },
    { name: 'Tailwind CSS', roleKey: 'about.tech.tailwind' as const },
    { name: '.NET 10', roleKey: 'about.tech.dotnet' as const },
    { name: 'Entity Framework', roleKey: 'about.tech.ef' as const },
    { name: 'SQLite / Postgres', roleKey: 'about.tech.db' as const },
]

export default function AboutPage() {
    const { t } = useTranslation()

    return (
        <div className="about-page">
            <header className="about-page-hero">
                <div className="about-page-hero-icon" aria-hidden>
                    <Info className="w-6 h-6" />
                </div>
                <div>
                    <h1>{t('about.title')}</h1>
                    <p>{t('about.subtitle')}</p>
                </div>
            </header>

            <section className="about-card about-intro">
                <p>{t('about.intro1')}</p>
                <p>{t('about.intro2')}</p>
            </section>

            <section className="about-card about-author">
                <div className="about-author-badge">
                    <UserRound className="w-5 h-5" />
                    <span>{t('about.authorLabel')}</span>
                </div>
                <h2>{t('about.authorName')}</h2>
                <p>{t('about.authorBio')}</p>
            </section>

            <section className="about-section">
                <h2>{t('about.featuresTitle')}</h2>
                <div className="about-feature-grid">
                    {FEATURES.map(f => {
                        const Icon = f.icon
                        return (
                            <article key={f.titleKey} className="about-feature-card">
                                <div className="about-feature-icon">
                                    <Icon className="w-5 h-5" />
                                </div>
                                <h3>{t(f.titleKey)}</h3>
                                <p>{t(f.descKey)}</p>
                            </article>
                        )
                    })}
                </div>
            </section>

            <section className="about-section">
                <h2>{t('about.techTitle')}</h2>
                <div className="about-tech-panel">
                    <div className="about-tech-grid">
                        {TECH.map(item => (
                            <div key={item.name} className="about-tech-item">
                                <strong>{item.name}</strong>
                                <span>{t(item.roleKey)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="about-card about-secrets">
                <div className="about-secrets-head">
                    <Layers className="w-5 h-5" />
                    <h2>{t('about.secretsTitle')}</h2>
                </div>
                <p>{t('about.secretsP1')}</p>
                <p>{t('about.secretsP2')}</p>
            </section>

            <p className="about-footnote">
                <Sparkles className="w-4 h-4" />
                {t('about.footnote')}
            </p>
        </div>
    )
}
