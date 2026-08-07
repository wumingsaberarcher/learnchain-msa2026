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

type LogLine = { id: number; ok: boolean; text: string }

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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => {
        window.clearTimeout(t)
        resolve(v)
      },
      (e) => {
        window.clearTimeout(t)
        reject(e)
      },
    )
  })
}

export default function GroupMaterialsDirectory({ groupId, groupName, onCountChange, onClose }: Props) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const logId = useRef(0)
  const refreshGen = useRef(0)
  const [items, setItems] = useState<DirItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const pushLog = useCallback((text: string, ok = true) => {
    const id = ++logId.current
    const line = { id, ok, text }
    console[ok ? 'info' : 'error'](`[materials-folder] ${text}`)
    setLogs((prev) => [...prev.slice(-12), line])
  }, [])

  const applyLocalRemote = useCallback((local: LocalGroupMaterial[], remote: HabitGroupMaterialDto[]) => {
    setItems([...local.map(localToItem), ...remote.map(remoteToItem)])
  }, [])

  const refresh = useCallback(async () => {
    const gen = ++refreshGen.current
    setLoading(true)
    pushLog(`1/3 ${t('groups.stageLoadLocal')}`)
    try {
      const local = await localListGroupFiles(groupId)
      if (gen !== refreshGen.current) return
      // Show local immediately — never wait on backend to paint the list.
      applyLocalRemote(local, [])
      pushLog(`✓ ${t('groups.stageLoadLocalOk', { n: local.length })}`)

      pushLog(`2/3 ${t('groups.stageLoadRemote')}`)
      let remote: HabitGroupMaterialDto[] = []
      try {
        remote = await withTimeout(listGroupMaterials(groupId), 8000, 'listGroupMaterials')
        if (gen !== refreshGen.current) return
        pushLog(`✓ ${t('groups.stageLoadRemoteOk', { n: remote.length })}`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        pushLog(`⚠ ${t('groups.stageLoadRemoteSkip')}: ${msg}`, false)
        console.warn('[materials-folder] remote list skipped:', e)
      }

      // Re-read local in case user uploaded during remote wait
      const localFresh = await localListGroupFiles(groupId)
      if (gen !== refreshGen.current) return
      applyLocalRemote(localFresh, remote)
      pushLog(`3/3 ${t('groups.stageReady', { n: localFresh.length + remote.length })}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushLog(`✗ ${t('groups.stageLoadFail')}: ${msg}`, false)
      console.error('[materials-folder] refresh failed:', e)
    } finally {
      if (gen === refreshGen.current) setLoading(false)
    }
  }, [groupId, applyLocalRemote, pushLog, t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleUpload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    pushLog(`▶ ${t('groups.stagePick', { n: list.length })}`)
    if (!list.length) {
      pushLog(`✗ ${t('groups.stagePickEmpty')}`, false)
      return
    }

    setAdding(true)
    let okCount = 0
    try {
      for (let i = 0; i < list.length; i++) {
        const f = list[i]!
        const tag = `[${i + 1}/${list.length}] ${f.name}`
        pushLog(`${tag} — ${t('groups.stageCheck')} (${(f.size / 1024).toFixed(1)} KB)`)

        if (f.size <= 0) {
          pushLog(`${tag} — ✗ ${t('groups.stageEmptyFile')}`, false)
          continue
        }
        if (f.size > 8 * 1024 * 1024) {
          pushLog(`${tag} — ✗ ${t('groups.fileTooLarge', { name: f.name })}`, false)
          continue
        }

        pushLog(`${tag} — ${t('groups.stageSaveLocal')}`)
        try {
          const row = await localPutGroupFile(groupId, f, (stage) => {
            pushLog(`${tag} · ${stage}`)
          })
          // Optimistic: append immediately
          setItems((prev) => {
            const withoutDup = prev.filter((x) => x.key !== row.id)
            return [localToItem(row), ...withoutDup]
          })
          okCount += 1
          pushLog(`${tag} — ✓ ${t('groups.stageSaveLocalOk')}`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          pushLog(`${tag} — ✗ ${t('groups.stageSaveLocalFail')}: ${msg}`, false)
          console.error('[materials-folder] localPut failed:', e)
        }
      }

      // Bump generation so an in-flight refresh cannot wipe these rows with a stale snapshot
      refreshGen.current += 1
      onCountChange?.()

      if (okCount > 0) {
        pushLog(`✓ ${t('groups.stageUploadDone', { n: okCount })}`)
      } else {
        pushLog(`✗ ${t('groups.stageUploadNone')}`, false)
      }
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
    try {
      if (item.source === 'local' && item.localId) {
        await localRenameGroupFile(item.localId, name)
        setItems((prev) => prev.map((x) => (x.key === item.key ? { ...x, fileName: name } : x)))
        pushLog(`✓ rename local: ${name}`)
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
          pushLog(`✓ rename remote: ${updated.fileName}`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          pushLog(`✗ rename remote failed: ${msg}`, false)
          console.error('[materials-folder] rename remote:', e)
        }
      }
      setEditingKey(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushLog(`✗ rename failed: ${msg}`, false)
      console.error('[materials-folder] rename:', e)
    } finally {
      setBusyKey(null)
    }
  }

  const handleDelete = async (item: DirItem) => {
    if (!confirm(t('groups.deleteFileConfirm', { name: item.fileName }))) return
    setBusyKey(item.key)
    try {
      if (item.source === 'local' && item.localId) {
        await localDeleteGroupFile(item.localId)
      } else if (item.remoteId != null) {
        await deleteGroupMaterial(groupId, item.remoteId)
      }
      setItems((prev) => prev.filter((x) => x.key !== item.key))
      onCountChange?.()
      pushLog(`✓ deleted ${item.fileName}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      pushLog(`✗ delete failed: ${msg}`, false)
      console.error('[materials-folder] delete:', e)
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
              pushLog(`file-input change: ${files?.length ?? 0} file(s)`)
              e.target.value = ''
              if (files?.length) void handleUpload(files)
              else pushLog(`✗ ${t('groups.stagePickEmpty')}`, false)
            }}
          />
          <button
            type="button"
            className="btn-habit btn-habit-checkin habits-mat-upload-btn"
            disabled={adding}
            onClick={() => {
              pushLog(t('groups.stageOpenPicker'))
              fileRef.current?.click()
            }}
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t('assess.upload')}
          </button>
          <button type="button" className="habits-group-icon-btn" onClick={onClose} title={t('assess.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="habits-mat-dir-log" aria-live="polite">
          {logs.map((l) => (
            <div key={l.id} className={`habits-mat-dir-log-line${l.ok ? '' : ' is-fail'}`}>
              {l.text}
            </div>
          ))}
        </div>
      )}

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
