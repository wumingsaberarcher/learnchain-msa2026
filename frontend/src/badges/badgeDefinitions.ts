import type { TranslationKey } from '../i18n/translations'

const badgeImages = import.meta.glob('../assets/badges/**/*.png', {
    eager: true,
    import: 'default',
}) as Record<string, string>

function imagePath(relativePath: string): string {
    const key = Object.keys(badgeImages).find(k => k.replace(/\\/g, '/').endsWith(relativePath))
    return key ? badgeImages[key] : ''
}

export type BadgeCategory = 'major' | 'level' | 'streak' | 'total'

export interface BadgeDefinition {
    id: string
    category: BadgeCategory
    image: string
    titleKey: TranslationKey
    descKey: TranslationKey
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
    { id: 'first_step', category: 'major', image: imagePath('大型里程碑/第一步（创建第一个习惯）.png'), titleKey: 'badge.first_step.title', descKey: 'badge.first_step.desc' },
    { id: 'ice_breaker', category: 'major', image: imagePath('大型里程碑/破冰者（完成第一个OneTime习惯）.png'), titleKey: 'badge.ice_breaker.title', descKey: 'badge.ice_breaker.desc' },
    { id: 'all_rounder', category: 'major', image: imagePath('大型里程碑/全能王（同时拥有5个及以上活跃习惯）.png'), titleKey: 'badge.all_rounder.title', descKey: 'badge.all_rounder.desc' },
    { id: 'self_investor', category: 'major', image: imagePath('大型里程碑/自我投资家（累计获得1000 XP）.png'), titleKey: 'badge.self_investor.title', descKey: 'badge.self_investor.desc' },
    { id: 'early_bird', category: 'major', image: imagePath('大型里程碑/早起鸟（连续7天早起打卡）.png'), titleKey: 'badge.early_bird.title', descKey: 'badge.early_bird.desc' },
    { id: 'phoenix', category: 'major', image: imagePath('大型里程碑/不灭之火（断连后重新连上30天）.png'), titleKey: 'badge.phoenix.title', descKey: 'badge.phoenix.desc' },

    { id: 'level_5', category: 'level', image: imagePath('等级里程碑/启蒙者（Level 5）.png'), titleKey: 'badge.level_5.title', descKey: 'badge.level_5.desc' },
    { id: 'level_10', category: 'level', image: imagePath('等级里程碑/探索者（Level 10）.png'), titleKey: 'badge.level_10.title', descKey: 'badge.level_10.desc' },
    { id: 'level_20', category: 'level', image: imagePath('等级里程碑/践行者（Level 20）.png'), titleKey: 'badge.level_20.title', descKey: 'badge.level_20.desc' },
    { id: 'level_30', category: 'level', image: imagePath('等级里程碑/坚持者（Level 30）.png'), titleKey: 'badge.level_30.title', descKey: 'badge.level_30.desc' },
    { id: 'level_50', category: 'level', image: imagePath('等级里程碑/大师级（Level 50）.png'), titleKey: 'badge.level_50.title', descKey: 'badge.level_50.desc' },
    { id: 'level_100', category: 'level', image: imagePath('等级里程碑/传奇存在（Level 100）.png'), titleKey: 'badge.level_100.title', descKey: 'badge.level_100.desc' },

    { id: 'streak_3', category: 'streak', image: imagePath('连击系列/新手连击（3天连击）.png'), titleKey: 'badge.streak_3.title', descKey: 'badge.streak_3.desc' },
    { id: 'streak_7', category: 'streak', image: imagePath('连击系列/一周坚持（7天连击）.png'), titleKey: 'badge.streak_7.title', descKey: 'badge.streak_7.desc' },
    { id: 'streak_14', category: 'streak', image: imagePath('连击系列/双周王者（14天连击）.png'), titleKey: 'badge.streak_14.title', descKey: 'badge.streak_14.desc' },
    { id: 'streak_30', category: 'streak', image: imagePath('连击系列/月度达人（30天连击）.png'), titleKey: 'badge.streak_30.title', descKey: 'badge.streak_30.desc' },
    { id: 'streak_60', category: 'streak', image: imagePath('连击系列/双月传奇（60天连击）.png'), titleKey: 'badge.streak_60.title', descKey: 'badge.streak_60.desc' },
    { id: 'streak_100', category: 'streak', image: imagePath('连击系列/百日不败（100天连击）.png'), titleKey: 'badge.streak_100.title', descKey: 'badge.streak_100.desc' },
    { id: 'streak_180', category: 'streak', image: imagePath('连击系列/半年守护者（180天连击）.png'), titleKey: 'badge.streak_180.title', descKey: 'badge.streak_180.desc' },
    { id: 'streak_365', category: 'streak', image: imagePath('连击系列/年度传奇（365天连击）.png'), titleKey: 'badge.streak_365.title', descKey: 'badge.streak_365.desc' },

    { id: 'total_10', category: 'total', image: imagePath('总量成就/初次启程（累计10次）.png'), titleKey: 'badge.total_10.title', descKey: 'badge.total_10.desc' },
    { id: 'total_50', category: 'total', image: imagePath('总量成就/小有所成（累计50次）.png'), titleKey: 'badge.total_50.title', descKey: 'badge.total_50.desc' },
    { id: 'total_100', category: 'total', image: imagePath('总量成就/百次里程碑（累计100次）.png'), titleKey: 'badge.total_100.title', descKey: 'badge.total_100.desc' },
    { id: 'total_180', category: 'total', image: imagePath('总量成就/半年耕耘（累计180次）.png'), titleKey: 'badge.total_180.title', descKey: 'badge.total_180.desc' },
    { id: 'total_365', category: 'total', image: imagePath('总量成就/年度耕耘者（累计365次）.png'), titleKey: 'badge.total_365.title', descKey: 'badge.total_365.desc' },
    { id: 'total_1000', category: 'total', image: imagePath('总量成就/千次传说（累计1000次）.png'), titleKey: 'badge.total_1000.title', descKey: 'badge.total_1000.desc' },
]

export const BADGE_MAP = Object.fromEntries(BADGE_DEFINITIONS.map(b => [b.id, b])) as Record<string, BadgeDefinition>

export const BADGE_CATEGORIES: { id: BadgeCategory; labelKey: TranslationKey }[] = [
    { id: 'major', labelKey: 'badge.cat.major' },
    { id: 'level', labelKey: 'badge.cat.level' },
    { id: 'streak', labelKey: 'badge.cat.streak' },
    { id: 'total', labelKey: 'badge.cat.total' },
]
