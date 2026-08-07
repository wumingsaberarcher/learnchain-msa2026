import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Brain,
  CalendarDays,
  ChevronRight,
  HeartHandshake,
  ListTodo,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from 'lucide-react'
import type { UserMemoryItem } from '../api/chatApi'
import type { TranslationKey } from '../i18n/translations'
import {
  groupMemories,
  memoryPreview,
  type MemoryGroupId,
} from '../utils/memoryGroups'

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string

type Props = {
  memories: UserMemoryItem[]
  t: TFn
  onDelete: (id: number) => void | Promise<void>
  onResetAll: () => void | Promise<void>
}

const GROUP_META: Record<
  MemoryGroupId,
  { titleKey: TranslationKey; descKey: TranslationKey; Icon: typeof UserRound }
> = {
  profile: {
    titleKey: 'profile.memGroup.profile',
    descKey: 'profile.memGroup.profileDesc',
    Icon: UserRound,
  },
  habits: {
    titleKey: 'profile.memGroup.habits',
    descKey: 'profile.memGroup.habitsDesc',
    Icon: ListTodo,
  },
  study: {
    titleKey: 'profile.memGroup.study',
    descKey: 'profile.memGroup.studyDesc',
    Icon: BookOpen,
  },
  preferences: {
    titleKey: 'profile.memGroup.preferences',
    descKey: 'profile.memGroup.preferencesDesc',
    Icon: SlidersHorizontal,
  },
  bonds: {
    titleKey: 'profile.memGroup.bonds',
    descKey: 'profile.memGroup.bondsDesc',
    Icon: HeartHandshake,
  },
  events: {
    titleKey: 'profile.memGroup.events',
    descKey: 'profile.memGroup.eventsDesc',
    Icon: CalendarDays,
  },
  facts: {
    titleKey: 'profile.memGroup.facts',
    descKey: 'profile.memGroup.factsDesc',
    Icon: Brain,
  },
}

function formatWhen(iso: string, languageHint: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  try {
    return new Date(t).toLocaleString(languageHint.startsWith('zh') ? 'zh-CN' : undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function MemoryVault({ memories, t, onDelete, onResetAll }: Props) {
  const [openGroup, setOpenGroup] = useState<MemoryGroupId | null>(null)
  const groups = useMemo(() => groupMemories(memories), [memories])
  const active = groups.find((g) => g.id === openGroup) ?? null

  // Infer locale loosely from translated empty string presence — Profile passes t already localized.
  const localeHint = t('profile.memoryEmpty').includes('暂无') ? 'zh' : 'en'

  return (
    <div className="memory-vault">
      <div className="memory-vault-head">
        <div className="memory-vault-title-row">
          <Brain className="memory-vault-mark" aria-hidden />
          <div>
            <h3 className="memory-vault-title">{t('profile.memoryTitle')}</h3>
            <p className="profile-hint memory-vault-hint">{t('profile.memoryHint')}</p>
          </div>
        </div>
        <div className="memory-vault-stats">
          <span>{t('profile.memoryCount', { n: memories.length })}</span>
          <span>{t('profile.memoryGroupCount', { n: groups.length })}</span>
        </div>
      </div>

      {memories.length === 0 ? (
        <p className="profile-hint memory-vault-empty">{t('profile.memoryEmpty')}</p>
      ) : active ? (
        <div className="memory-vault-detail">
          <button
            type="button"
            className="memory-vault-back"
            onClick={() => setOpenGroup(null)}
          >
            <ArrowLeft className="w-4 h-4" />
            {t('profile.memoryBack')}
          </button>
          <div className="memory-vault-detail-head">
            {(() => {
              const Meta = GROUP_META[active.id]
              const Icon = Meta.Icon
              return (
                <>
                  <span className="memory-group-icon">
                    <Icon className="w-5 h-5" />
                  </span>
                  <div>
                    <h4>{t(Meta.titleKey)}</h4>
                    <p>{t('profile.memoryEntries', { n: active.items.length })}</p>
                  </div>
                </>
              )
            })()}
          </div>
          <ul className="memory-entry-list">
            {active.items.map((m) => (
              <li key={m.id} className="memory-entry">
                <div className="memory-entry-body">
                  <div className="memory-entry-meta">
                    <span className="memory-entry-key">{m.key || m.type}</span>
                    <span className="memory-entry-type">{m.type}</span>
                    {m.updatedAt && (
                      <span className="memory-entry-time">{formatWhen(m.updatedAt, localeHint)}</span>
                    )}
                  </div>
                  <p className="memory-entry-content">{m.content}</p>
                </div>
                <button
                  type="button"
                  className="memory-entry-delete"
                  onClick={() => void onDelete(m.id)}
                  title={t('profile.memoryDelete')}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t('profile.memoryDelete')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="memory-group-grid">
          {groups.map((g) => {
            const Meta = GROUP_META[g.id]
            const Icon = Meta.Icon
            const newest = g.items[0]
            return (
              <li key={g.id}>
                <button
                  type="button"
                  className="memory-group-card"
                  onClick={() => setOpenGroup(g.id)}
                >
                  <span className="memory-group-icon">
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="memory-group-copy">
                    <span className="memory-group-name">{t(Meta.titleKey)}</span>
                    <span className="memory-group-desc">{t(Meta.descKey)}</span>
                    {newest && (
                      <span className="memory-group-preview">
                        {memoryPreview(newest)}
                      </span>
                    )}
                  </span>
                  <span className="memory-group-aside">
                    <span className="memory-group-count">{g.items.length}</span>
                    <ChevronRight className="w-4 h-4 opacity-70" />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button
        type="button"
        className="btn btn-secondary profile-save-btn memory-vault-reset"
        onClick={() => void onResetAll()}
      >
        {t('profile.memoryResetAll')}
      </button>
    </div>
  )
}
