import { useCallback, useEffect, useRef, useState } from 'react'
import { CloudOff, Loader2, Pencil, Trash2, Upload, X } from 'lucide-react'
import {
  deleteGroupMaterial,
  listGroupMaterials,
  renameGroupMaterial,
  type HabitGroupMaterialDto,
} from '../api/habitGroupApi'
import {
  localDeleteGroupFile,
  localListGroupFiles,
  localPutGroupFile,
  localRenameGroupFile,
  type LocalGroupMaterial,
} from '../utils/groupMaterialsLocal'
import { useTranslation } from '../stores/languageStore'

type Props = {
  groupId: number
  groupName: string
  onCountChange?: () => void
  onClose: () => void
}

type DirItem = {
  key: string
  source: 'local' | 'remote'
  localId?: string
  remoteId?: number
  fileName: string
  size: number
  hasText: boolean
  textLength: number
  pending?: boolean
}

function remoteToItem(m: HabitGroupMaterialDto): DirItem {
  return {
    key: `r-${m.id}`,
    source: 'remote',
    remoteId: m.id,
    fileName: m.fileName,
    size: m.size,
    hasText: m.hasText,
    textLength: m.textLength,
  }
}

function localToItem(m: LocalGroupMaterial): DirItem {
  return {
    key: m.id,
    source: 'local',
    localId: m.id,
    fileName: m.fileName,
    size: m.size,
    hasText: false,
    textLength: 0,
    pending: true,
  }
}

export default function GroupMaterialsDirectory({ groupId, groupName, onCountChange, onClose }: Props) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<DirItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const mergeLists = useCallback((local: LocalGroupMaterial[], remote: HabitGroupMaterialDto[]) => {
    const remoteItems = remote.map(remoteToItem)
    const localItems = local.map(localToItem)
    // Prefer showing locals first (just added), then remote; dedupe by fileName+size soft match not needed
    setItems([...localItems, ...remoteItems])
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const local = await localListGroupFiles(groupId)
      let remote: HabitGroupMaterialDto[] = []
      try {
        remote = await listGroupMaterials(groupId)
      } catch {
        // Backend may be cold — local files still show.
      }
      mergeLists(local, remote)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }, [groupId, mergeLists])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /** Instant local save — no backend wait. */
  const handleUpload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setAdding(true)
    setError(null)
    setStatus(t('groups.savedLocally'))
    try {
      for (const f of list) {
        if (f.size <= 0) continue
        if (f.size > 8 * 1024 * 1024) {
          setError(t('groups.fileTooLarge', { name: f.name }))
          continue
        }
        await localPutGroupFile(groupId, f)
      }
      const local = await localListGroupFiles(groupId)
      setItems((prev) => {
        const remoteOnly = prev.filter((x) => x.source === 'remote')
        return [...local.map(localToItem), ...remoteOnly]
      })
      onCountChange?.()
      setStatus(t('groups.savedLocalHint'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed')
      setStatus(null)
    } finally {
      setAdding(false)
    }
  }

  const startRename = (item: DirItem) => {
    setEditingKey(item.key)
    setEditName(item.fileName)
  }

  const saveRename = async (item: DirItem) => {
    const name = editName.trim()
    if (!name) {
      setEditingKey(null)
      return
    }
    setBusyKey(item.key)
    setError(null)
    try {
      if (item.source === 'local' && item.localId) {
        await localRenameGroupFile(item.localId, name)
        setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, fileName: name } : x)))
      } else if (item.remoteId != null) {
        try {
          const updated = await renameGroupMaterial(groupId, item.remoteId, name)
          setItems((prev) =>
            prev.map((x) =>
              x.key === item.key
                ? { ...x, fileName: updated.fileName, hasText: updated.hasText, textLength: updated.textLength }
                : x,
            ),
          )
        } catch (e) {
          setError(e instanceof Error ? e.message : 'rename failed')
        }
      }
      setEditingKey(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'rename failed')
    } finally {
      setBusyKey(null)
    }
  }

  const handleDelete = async (item: DirItem) => {
    if (!confirm(t('groups.deleteFileConfirm', { name: item.fileName }))) return
    setBusyKey(item.key)
    setError(null)
    try {
      if (item.source === 'local' && item.localId) {
        await localDeleteGroupFile(item.localId)
      } else if (item.remoteId != null) {
        await deleteGroupMaterial(groupId, item.remoteId)
      }
      setItems((prev) => prev.filter((x) => x.key !== item.key))
      onCountChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed')
    } finally {
      setBusyKey(null)
    }
  }

  const extBadge = (name: string) => {
    const ext = name.split('.').pop()?.toUpperCase() || 'FILE'
    return ext.slice(0, 4)
  }

  return (
    <div className="habits-mat-dir">
      <div className="habits-mat-dir-head">
        <div className="habits-mat-dir-head-main">
          <div className="habits-mat-dir-title-row">
            <div className="habits-mat-dir-title">{t('groups.materialsDir')}</div>
            <span className="habits-mat-dir-badge">
              <CloudOff className="w-3 h-3" />
              {t('groups.localFirst')}
            </span>
          </div>
          <div className="habits-mat-dir-sub">{groupName}</div>
        </div>
        <div className="habits-mat-dir-head-actions">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept=".pdf,.docx,.doc,.wps,.md,.txt,application/pdf"
            onChange={(e) => {
              const files = e.target.files
              e.target.value = ''
              if (files?.length) void handleUpload(files)
            }}
          />
          <button
            type="button"
            className="btn-habit btn-habit-checkin habits-mat-upload-btn"
            disabled={adding}
            onClick={() => fileRef.current?.click()}
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t('assess.upload')}
          </button>
          <button type="button" className="habits-group-icon-btn" onClick={onClose} title={t('assess.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="habits-error" role="alert">
          {error}
        </div>
      )}
      {status && <p className="habits-mat-dir-status">{status}</p>}

      <div className="habits-mat-dir-list" role="list">
        {loading && items.length === 0 ? (
          <div className="habits-empty-hint">
            <Loader2 className="w-4 h-4 animate-spin inline" /> {t('groups.loadingFiles')}
          </div>
        ) : items.length === 0 ? (
          <div className="habits-empty-hint">{t('groups.noFilesLocal')}</div>
        ) : (
          items.map((m) => (
            <div key={m.key} className="habits-mat-dir-row" role="listitem">
              <span className="habits-mat-ext">{extBadge(m.fileName)}</span>
              <div className="habits-mat-dir-main">
                {editingKey === m.key ? (
                  <input
                    className="habit-edit-input habits-mat-rename-input"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveRename(m)
                      if (e.key === 'Escape') setEditingKey(null)
                    }}
                    onBlur={() => void saveRename(m)}
                    disabled={busyKey === m.key}
                  />
                ) : (
                  <button type="button" className="habits-mat-name-btn" onClick={() => startRename(m)}>
                    <strong>{m.fileName}</strong>
                  </button>
                )}
                <small>
                  {(m.size / 1024).toFixed(1)} KB
                  {m.pending
                    ? ` · ${t('groups.localOnly')}`
                    : m.hasText
                      ? ` · ${m.textLength} chars`
                      : ` · ${t('assess.noText')}`}
                </small>
              </div>
              <div className="habits-mat-dir-actions">
                <button
                  type="button"
                  className="habits-group-icon-btn"
                  title={t('groups.renameFile')}
                  disabled={busyKey === m.key}
                  onClick={() => startRename(m)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  className="habits-group-icon-btn danger"
                  title={t('assess.delete')}
                  disabled={busyKey === m.key}
                  onClick={() => void handleDelete(m)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
