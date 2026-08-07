import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import type { Habit, HabitGroup } from '../utils/habitHelpers'
import {
  createHabitGroup,
  deleteHabitGroup,
  generateGroupDescription,
  listHabitGroups,
  moveHabitToGroup,
  updateHabitGroup,
} from '../api/habitGroupApi'
import GroupMaterialsDirectory from './GroupMaterialsDirectory'
import { localCollectTextExcerpts, localCountGroupFiles } from '../utils/groupMaterialsLocal'
import { triggerGroupPractice } from '../stores/assessmentStore'
import { useHabitStore } from '../stores/habitStore'
import { useAiSettingsStore } from '../stores/aiSettingsStore'
import { useTranslation } from '../stores/languageStore'

type Props = {
  habits: Habit[]
  renderHabit: (habit: Habit) => ReactNode
}

function normalizeGroup(raw: HabitGroup & { Name?: string; Description?: string | null }): HabitGroup {
  return {
    id: raw.id,
    name: raw.name || raw.Name || '',
    description: raw.description ?? raw.Description ?? null,
    createdAt: raw.createdAt,
    habitCount: raw.habitCount ?? 0,
    materialCount: raw.materialCount ?? 0,
  }
}

export default function HabitGroupsBoard({ habits, renderHabit }: Props) {
  const { t, language } = useTranslation()
  const patchHabitLocal = useHabitStore((s) => s.patchHabitLocal)
  const patchHabitsLocal = useHabitStore((s) => s.patchHabitsLocal)
  const apiKey = useAiSettingsStore((s) => s.apiKey)
  const baseUrl = useAiSettingsStore((s) => s.baseUrl)
  const model = useAiSettingsStore((s) => s.model)
  const [groups, setGroups] = useState<HabitGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Partial<Record<number | 'ungrouped', boolean>>>({
    ungrouped: true,
  })
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [genDescId, setGenDescId] = useState<number | null>(null)
  /** Which group's materials directory is open (inline, not modal). */
  const [materialsFor, setMaterialsFor] = useState<number | null>(null)
  const [menuHabitId, setMenuHabitId] = useState<number | null>(null)
  const [dragHabitId, setDragHabitId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | 'ungrouped' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshGroups = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const list = await listHabitGroups()
      setGroups(list.map((g) => normalizeGroup(g as HabitGroup & { Name?: string })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load groups')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshGroups()
  }, [refreshGroups])

  const grouped = useMemo(() => {
    const map = new Map<number, Habit[]>()
    const ungrouped: Habit[] = []
    for (const h of habits) {
      if (h.groupId != null && h.groupId > 0) {
        const list = map.get(h.groupId) ?? []
        list.push(h)
        map.set(h.groupId, list)
      } else {
        ungrouped.push(h)
      }
    }
    return { map, ungrouped }
  }, [habits])

  const openMaterialsDir = (groupId: number) => {
    // Keep habits compact; only toggle the materials directory panel.
    setMaterialsFor((cur) => (cur === groupId ? null : groupId))
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setBusyId(-1)
    try {
      const created = normalizeGroup(
        (await createHabitGroup({
          name: newName.trim(),
          description: newDesc.trim() || undefined,
        })) as HabitGroup & { Name?: string },
      )
      setNewName('')
      setNewDesc('')
      setCreating(false)
      await refreshGroups()
      setExpanded((e) => ({ ...e, [created.id]: false }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create failed')
    } finally {
      setBusyId(null)
    }
  }

  const handleMove = async (habitId: number, groupId: number | null) => {
    setMenuHabitId(null)
    const prev = habits.find((h) => h.id === habitId)?.groupId ?? null
    patchHabitLocal(habitId, { groupId })
    setGroups((gs) =>
      gs.map((g) => {
        let habitCount = g.habitCount
        if (prev === g.id) habitCount = Math.max(0, habitCount - 1)
        if (groupId === g.id) habitCount += 1
        return habitCount === g.habitCount ? g : { ...g, habitCount }
      }),
    )
    try {
      await moveHabitToGroup(habitId, groupId)
    } catch (e) {
      patchHabitLocal(habitId, { groupId: prev })
      setGroups((gs) =>
        gs.map((g) => {
          let habitCount = g.habitCount
          if (groupId === g.id) habitCount = Math.max(0, habitCount - 1)
          if (prev === g.id) habitCount += 1
          return habitCount === g.habitCount ? g : { ...g, habitCount }
        }),
      )
      setError(e instanceof Error ? e.message : 'move failed')
    }
  }

  const handleDeleteGroup = async (id: number) => {
    if (!confirm(t('groups.deleteConfirm'))) return
    const snapshot = groups.find((g) => g.id === id)
    const affected = habits.filter((h) => h.groupId === id).map((h) => h.id)
    setGroups((gs) => gs.filter((g) => g.id !== id))
    if (materialsFor === id) setMaterialsFor(null)
    patchHabitsLocal((list) => list.map((h) => (h.groupId === id ? { ...h, groupId: null } : h)))
    try {
      await deleteHabitGroup(id)
    } catch (e) {
      if (snapshot) setGroups((gs) => [...gs, snapshot].sort((a, b) => b.id - a.id))
      patchHabitsLocal((list) =>
        list.map((h) => (affected.includes(h.id) ? { ...h, groupId: id } : h)),
      )
      setError(e instanceof Error ? e.message : 'delete failed')
    }
  }

  const handleRename = async (g: HabitGroup) => {
    const name = prompt(t('groups.renamePrompt'), g.name)
    if (!name?.trim()) return
    try {
      await updateHabitGroup(g.id, { name: name.trim() })
      await refreshGroups(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'rename failed')
    }
  }

  const handleGenerateDesc = async (g: HabitGroup) => {
    if (g.materialCount <= 0) {
      setError(t('groups.genDescNeedMats'))
      return
    }
    if (!apiKey.trim()) {
      setError(t('groups.genDescNeedKey'))
      return
    }
    setGenDescId(g.id)
    setError(null)
    try {
      const localExcerpts = await localCollectTextExcerpts(g.id)
      const { description } = await generateGroupDescription(g.id, {
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
        language,
        overwrite: false,
        localExcerpts: localExcerpts.length ? localExcerpts : undefined,
      })
      setGroups((gs) => gs.map((x) => (x.id === g.id ? { ...x, description } : x)))
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'missing_api_key') setError(t('groups.genDescNeedKey'))
      else if (msg === 'no_materials') setError(t('groups.genDescNeedMats'))
      else setError(msg || t('groups.genDescFail'))
    } finally {
      setGenDescId(null)
    }
  }

  const onDropZone = async (target: number | 'ungrouped') => {
    if (dragHabitId == null) return
    await handleMove(dragHabitId, target === 'ungrouped' ? null : target)
    setDragHabitId(null)
    setDropTarget(null)
  }

  if (loading && groups.length === 0) {
    return (
      <div className="habits-groups-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('groups.loading')}
      </div>
    )
  }

  const renderDropZone = (
    key: number | 'ungrouped',
    title: ReactNode,
    body: ReactNode,
    actions?: ReactNode,
    subtitle?: ReactNode,
  ) => {
    const isOpen = !!expanded[key]
    const isDrop = dropTarget === key
    return (
      <section
        className={`habits-group-card${isOpen ? ' is-expanded' : ' is-compact'}${isDrop ? ' drop-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDropTarget(key)
        }}
        onDragLeave={() => setDropTarget((cur) => (cur === key ? null : cur))}
        onDrop={(e) => {
          e.preventDefault()
          void onDropZone(key)
        }}
      >
        <div className="habits-group-head">
          <button
            type="button"
            className="habits-group-toggle"
            onClick={() => setExpanded((c) => ({ ...c, [key]: !c[key] }))}
            aria-expanded={isOpen}
          >
            {isOpen ? <ChevronDown className="w-4 h-4 habits-group-chevron" /> : <ChevronRight className="w-4 h-4 habits-group-chevron" />}
            <span className="habits-group-toggle-text">
              {title}
              {subtitle}
            </span>
          </button>
          {actions}
        </div>
        <div className="habits-group-body">{body}</div>
      </section>
    )
  }

  const renderHabitRow = (h: Habit, currentGroupId: number | null) => (
    <div
      key={h.id}
      className="habits-group-habit"
      draggable
      onDragStart={() => setDragHabitId(h.id)}
      onDragEnd={() => {
        setDragHabitId(null)
        setDropTarget(null)
      }}
    >
      <span className="habits-drag-handle" title={t('groups.dragHint')}>
        <GripVertical className="w-4 h-4" />
      </span>
      <div className="habits-group-habit-main">{renderHabit(h)}</div>
      <div className="habits-move-wrap">
        <button
          type="button"
          className="habits-group-icon-btn"
          onClick={() => setMenuHabitId(menuHabitId === h.id ? null : h.id)}
          title={t('groups.move')}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuHabitId === h.id && (
          <div className="habits-move-menu">
            {currentGroupId != null && (
              <button type="button" onClick={() => void handleMove(h.id, null)}>
                {t('groups.ungroup')}
              </button>
            )}
            {groups
              .filter((x) => x.id !== currentGroupId)
              .map((x) => (
                <button key={x.id} type="button" onClick={() => void handleMove(h.id, x.id)}>
                  {t('groups.moveTo', { name: x.name })}
                </button>
              ))}
            {groups.length === 0 && <span className="habits-empty-hint">{t('groups.createFirst')}</span>}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="habits-groups-board">
      {error && (
        <div className="habits-error" role="alert">
          {error}
          <button type="button" className="habits-group-icon-btn" onClick={() => setError(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="habits-groups-toolbar">
        <button type="button" className="btn-habit btn-habit-ghost" onClick={() => setCreating(true)}>
          <FolderPlus className="w-4 h-4" />
          {t('groups.create')}
        </button>
      </div>

      {creating && (
        <div className="habits-group-create">
          <input
            className="habit-edit-input"
            placeholder={t('groups.namePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="habit-edit-input"
            placeholder={t('groups.descPlaceholder')}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div className="habits-modal-actions">
            <button type="button" className="btn-habit btn-habit-ghost" onClick={() => setCreating(false)}>
              {t('auth.cancel')}
            </button>
            <button
              type="button"
              className="btn-habit btn-habit-checkin"
              disabled={busyId === -1 || !newName.trim()}
              onClick={() => void handleCreate()}
            >
              {busyId === -1 ? <Loader2 className="w-4 h-4 animate-spin" /> : t('groups.createConfirm')}
            </button>
          </div>
        </div>
      )}

      {groups.map((g) => {
        const members = grouped.map.get(g.id) ?? []
        const showDir = materialsFor === g.id
        return (
          <div key={g.id}>
            {renderDropZone(
              g.id,
              <span className="habits-group-title">
                <span className="habits-group-name">{g.name || t('groups.unnamed')}</span>
                <small>
                  {t('groups.counts', { habits: members.length, mats: g.materialCount })}
                </small>
              </span>,
              <>
                {members.length === 0 && <p className="habits-empty-hint">{t('groups.emptyHabits')}</p>}
                {members.map((h) => renderHabitRow(h, g.id))}
                {showDir && (
                  <GroupMaterialsDirectory
                    groupId={g.id}
                    groupName={g.name || t('groups.unnamed')}
                    onClose={() => setMaterialsFor(null)}
                    onCountChange={() => {
                      void localCountGroupFiles(g.id).then((n) => {
                        setGroups((gs) =>
                          gs.map((x) =>
                            x.id === g.id
                              ? { ...x, materialCount: Math.max(x.materialCount, n) }
                              : x,
                          ),
                        )
                      })
                    }}
                  />
                )}
              </>,
              <div className="habits-group-actions">
                <button type="button" className="habits-group-icon-btn" title={t('groups.practice')} onClick={() => void triggerGroupPractice(g)}>
                  <Play className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className={`habits-group-icon-btn${showDir ? ' is-active' : ''}`}
                  title={t('groups.materialsDir')}
                  onClick={() => openMaterialsDir(g.id)}
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
                <button type="button" className="habits-group-icon-btn" title={t('groups.rename')} onClick={() => void handleRename(g)}>
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" className="habits-group-icon-btn danger" title={t('groups.delete')} onClick={() => void handleDeleteGroup(g.id)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>,
              g.description ? (
                <span className="habits-group-desc">{g.description}</span>
              ) : g.materialCount > 0 ? (
                <div className="habits-group-desc-row">
                  <span className="habits-group-desc is-empty">{t('groups.genDescHint')}</span>
                  <button
                    type="button"
                    className="habits-group-gen-desc"
                    disabled={genDescId === g.id}
                    title={t('groups.genDesc')}
                    onClick={() => void handleGenerateDesc(g)}
                  >
                    {genDescId === g.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('groups.genDescBusy')}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        {t('groups.genDesc')}
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <span className="habits-group-desc is-empty">{t('groups.noDesc')}</span>
              ),
            )}
          </div>
        )
      })}

      {renderDropZone(
        'ungrouped',
        <span className="habits-group-title">
          <span className="habits-group-name">{t('groups.ungrouped')}</span>
          <small>{grouped.ungrouped.length}</small>
        </span>,
        <>
          {grouped.ungrouped.length === 0 && <p className="habits-empty-hint">{t('groups.emptyUngrouped')}</p>}
          {grouped.ungrouped.map((h) => renderHabitRow(h, null))}
        </>,
      )}
    </div>
  )
}
