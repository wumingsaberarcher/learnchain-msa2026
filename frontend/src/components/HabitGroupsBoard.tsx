import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type { Habit, HabitGroup } from '../utils/habitHelpers'
import {
  createHabitGroup,
  deleteGroupMaterial,
  deleteHabitGroup,
  listGroupMaterials,
  listHabitGroups,
  moveHabitToGroup,
  updateHabitGroup,
  uploadGroupMaterial,
  type HabitGroupMaterialDto,
} from '../api/habitGroupApi'
import { triggerGroupPractice } from '../stores/assessmentStore'
import { useTranslation } from '../stores/languageStore'

type Props = {
  habits: Habit[]
  onHabitsChanged: () => void
  renderHabit: (habit: Habit) => ReactNode
}

export default function HabitGroupsBoard({ habits, onHabitsChanged, renderHabit }: Props) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<HabitGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<number | 'ungrouped', boolean>>({})
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [materialsFor, setMaterialsFor] = useState<number | null>(null)
  const [materials, setMaterials] = useState<HabitGroupMaterialDto[]>([])
  const [uploading, setUploading] = useState(false)
  const [menuHabitId, setMenuHabitId] = useState<number | null>(null)
  const [dragHabitId, setDragHabitId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | 'ungrouped' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshGroups = useCallback(async () => {
    setLoading(true)
    try {
      setGroups(await listHabitGroups())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load groups')
    } finally {
      setLoading(false)
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

  const openMaterials = async (groupId: number) => {
    setMaterialsFor(groupId)
    try {
      setMaterials(await listGroupMaterials(groupId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'materials failed')
    }
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    setBusyId(-1)
    try {
      await createHabitGroup({ name: newName.trim(), description: newDesc.trim() || undefined })
      setNewName('')
      setNewDesc('')
      setCreating(false)
      await refreshGroups()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create failed')
    } finally {
      setBusyId(null)
    }
  }

  const handleMove = async (habitId: number, groupId: number | null) => {
    setMenuHabitId(null)
    try {
      await moveHabitToGroup(habitId, groupId)
      onHabitsChanged()
      await refreshGroups()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'move failed')
    }
  }

  const handleDeleteGroup = async (id: number) => {
    if (!confirm(t('groups.deleteConfirm'))) return
    try {
      await deleteHabitGroup(id)
      onHabitsChanged()
      await refreshGroups()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed')
    }
  }

  const handleRename = async (g: HabitGroup) => {
    const name = prompt(t('groups.renamePrompt'), g.name)
    if (!name?.trim()) return
    try {
      await updateHabitGroup(g.id, { name: name.trim() })
      await refreshGroups()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'rename failed')
    }
  }

  const onDropZone = async (target: number | 'ungrouped') => {
    if (dragHabitId == null) return
    await handleMove(dragHabitId, target === 'ungrouped' ? null : target)
    setDragHabitId(null)
    setDropTarget(null)
  }

  const uploadToOpenGroup = async (files: FileList | File[]) => {
    if (materialsFor == null) return
    const list = Array.from(files)
    setUploading(true)
    try {
      for (const f of list) {
        await uploadGroupMaterial(materialsFor, f)
      }
      setMaterials(await listGroupMaterials(materialsFor))
      await refreshGroups()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setUploading(false)
    }
  }

  if (loading && groups.length === 0) {
    return (
      <div className="habits-groups-loading">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('groups.loading')}
      </div>
    )
  }

  const renderDropZone = (key: number | 'ungrouped', title: ReactNode, body: ReactNode, actions?: ReactNode) => {
    const isOpen = !collapsed[key]
    const isDrop = dropTarget === key
    return (
      <section
        className={`habits-group-card${isDrop ? ' drop-active' : ''}`}
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
        <header className="habits-group-head">
          <button
            type="button"
            className="habits-group-toggle"
            onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {title}
          </button>
          {actions}
        </header>
        {isOpen && <div className="habits-group-body">{body}</div>}
      </section>
    )
  }

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
        return (
          <div key={g.id}>
            {renderDropZone(
              g.id,
              <span className="habits-group-title">
                {g.name}
                <small>
                  {t('groups.counts', { habits: members.length, mats: g.materialCount })}
                </small>
              </span>,
              <>
                {members.length === 0 && <p className="habits-empty-hint">{t('groups.emptyHabits')}</p>}
                {members.map((h) => (
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
                          <button type="button" onClick={() => void handleMove(h.id, null)}>
                            {t('groups.ungroup')}
                          </button>
                          {groups
                            .filter((x) => x.id !== g.id)
                            .map((x) => (
                              <button key={x.id} type="button" onClick={() => void handleMove(h.id, x.id)}>
                                {t('groups.moveTo', { name: x.name })}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>,
              <div className="habits-group-actions">
                <button type="button" className="habits-group-icon-btn" title={t('groups.practice')} onClick={() => void triggerGroupPractice(g)}>
                  <Play className="w-4 h-4" />
                </button>
                <button type="button" className="habits-group-icon-btn" title={t('groups.materials')} onClick={() => void openMaterials(g.id)}>
                  <Upload className="w-4 h-4" />
                </button>
                <button type="button" className="habits-group-icon-btn" title={t('groups.rename')} onClick={() => void handleRename(g)}>
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" className="habits-group-icon-btn danger" title={t('groups.delete')} onClick={() => void handleDeleteGroup(g.id)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>,
            )}
          </div>
        )
      })}

      {renderDropZone(
        'ungrouped',
        <span className="habits-group-title">
          {t('groups.ungrouped')}
          <small>{grouped.ungrouped.length}</small>
        </span>,
        <>
          {grouped.ungrouped.length === 0 && <p className="habits-empty-hint">{t('groups.emptyUngrouped')}</p>}
          {grouped.ungrouped.map((h) => (
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
                    {groups.map((x) => (
                      <button key={x.id} type="button" onClick={() => void handleMove(h.id, x.id)}>
                        {t('groups.moveTo', { name: x.name })}
                      </button>
                    ))}
                    {groups.length === 0 && <span className="habits-empty-hint">{t('groups.createFirst')}</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>,
      )}

      {materialsFor != null && (
        <div className="habits-modal-overlay" onClick={() => setMaterialsFor(null)}>
          <div className="habits-modal" onClick={(e) => e.stopPropagation()}>
            <div className="habits-modal-header">
              <h3 className="habits-modal-title">{t('groups.materials')}</h3>
              <button type="button" className="habits-modal-close" onClick={() => setMaterialsFor(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="habits-wizard-hint">{t('groups.materialsHint')}</p>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept=".pdf,.docx,.doc,.wps,.md,.txt"
              onChange={(e) => {
                const files = e.target.files
                e.target.value = ''
                if (files?.length) void uploadToOpenGroup(files)
              }}
            />
            <button
              type="button"
              className="btn-habit btn-habit-checkin"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {t('assess.upload')}
            </button>
            <ul className="habits-group-mat-list">
              {materials.length === 0 && <li className="habits-empty-hint">{t('assess.noMaterials')}</li>}
              {materials.map((m) => (
                <li key={m.id}>
                  <span>
                    <strong>{m.fileName}</strong>
                    <small>
                      {(m.size / 1024).toFixed(1)} KB
                      {m.hasText ? ` · ${m.textLength}` : ` · ${t('assess.noText')}`}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="habits-group-icon-btn danger"
                    onClick={() =>
                      void deleteGroupMaterial(materialsFor, m.id).then(async () => {
                        setMaterials(await listGroupMaterials(materialsFor))
                        await refreshGroups()
                      })
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="habits-modal-actions">
              <button
                type="button"
                className="btn-habit btn-habit-checkin"
                onClick={() => {
                  const g = groups.find((x) => x.id === materialsFor)
                  if (g) void triggerGroupPractice(g)
                  setMaterialsFor(null)
                }}
              >
                <Play className="w-4 h-4" />
                {t('groups.practice')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
