import { useEffect, useRef, useState } from 'react'
import { Loader2, Pencil, Trash2, Upload, X } from 'lucide-react'
import {
  deleteGroupMaterial,
  listGroupMaterials,
  renameGroupMaterial,
  uploadGroupMaterial,
  type HabitGroupMaterialDto,
} from '../api/habitGroupApi'
import { useTranslation } from '../stores/languageStore'

type Props = {
  groupId: number
  groupName: string
  onCountChange?: () => void
  onClose: () => void
}

export default function GroupMaterialsDirectory({ groupId, groupName, onCountChange, onClose }: Props) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<HabitGroupMaterialDto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listGroupMaterials(groupId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [groupId])

  const handleUpload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setUploading(true)
    setError(null)
    try {
      for (let i = 0; i < list.length; i++) {
        const f = list[i]!
        setStatus(
          list.length > 1
            ? t('assess.uploadingProgress', { current: i + 1, total: list.length })
            : `${t('assess.upload')}… ${f.name}`,
        )
        const dto = await uploadGroupMaterial(groupId, f, setStatus)
        if (dto.warning) setError(dto.warning)
      }
      setItems(await listGroupMaterials(groupId))
      onCountChange?.()
      setStatus(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed')
      setStatus(null)
    } finally {
      setUploading(false)
    }
  }

  const startRename = (m: HabitGroupMaterialDto) => {
    setEditingId(m.id)
    setEditName(m.fileName)
  }

  const saveRename = async (materialId: number) => {
    const name = editName.trim()
    if (!name) {
      setEditingId(null)
      return
    }
    setBusyId(materialId)
    setError(null)
    try {
      const updated = await renameGroupMaterial(groupId, materialId, name)
      setItems((prev) => prev.map((x) => (x.id === materialId ? { ...x, ...updated } : x)))
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'rename failed')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (materialId: number, fileName: string) => {
    if (!confirm(t('groups.deleteFileConfirm', { name: fileName }))) return
    setBusyId(materialId)
    setError(null)
    try {
      await deleteGroupMaterial(groupId, materialId)
      setItems((prev) => prev.filter((x) => x.id !== materialId))
      onCountChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed')
    } finally {
      setBusyId(null)
    }
  }

  const extBadge = (name: string) => {
    const ext = name.split('.').pop()?.toUpperCase() || 'FILE'
    return ext.slice(0, 4)
  }

  return (
    <div className="habits-mat-dir">
      <div className="habits-mat-dir-head">
        <div>
          <div className="habits-mat-dir-title">{t('groups.materialsDir')}</div>
          <div className="habits-mat-dir-sub">
            {groupName} · {t('groups.materialsHint')}
          </div>
        </div>
        <button type="button" className="habits-group-icon-btn" onClick={onClose} title={t('assess.close')}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="habits-error" role="alert">
          {error}
        </div>
      )}
      {status && <p className="habits-wizard-hint">{status}</p>}

      <div className="habits-mat-dir-toolbar">
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
          className="btn-habit btn-habit-checkin"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {t('assess.upload')}
        </button>
        <button type="button" className="btn-habit btn-habit-ghost" disabled={loading || uploading} onClick={() => void refresh()}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('groups.refreshFiles')}
        </button>
      </div>

      <div className="habits-mat-dir-list" role="list">
        {loading && items.length === 0 ? (
          <div className="habits-empty-hint">
            <Loader2 className="w-4 h-4 animate-spin inline" /> {t('groups.loadingFiles')}
          </div>
        ) : items.length === 0 ? (
          <div className="habits-empty-hint">{t('groups.noFiles')}</div>
        ) : (
          items.map((m) => (
            <div key={m.id} className="habits-mat-dir-row" role="listitem">
              <span className="habits-mat-ext">{extBadge(m.fileName)}</span>
              <div className="habits-mat-dir-main">
                {editingId === m.id ? (
                  <input
                    className="habit-edit-input habits-mat-rename-input"
                    value={editName}
                    autoFocus
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveRename(m.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => void saveRename(m.id)}
                    disabled={busyId === m.id}
                  />
                ) : (
                  <button type="button" className="habits-mat-name-btn" onClick={() => startRename(m)}>
                    <strong>{m.fileName}</strong>
                  </button>
                )}
                <small>
                  {(m.size / 1024).toFixed(1)} KB
                  {m.hasText ? ` · ${m.textLength} chars` : ` · ${t('assess.noText')}`}
                </small>
              </div>
              <div className="habits-mat-dir-actions">
                <button
                  type="button"
                  className="habits-group-icon-btn"
                  title={t('groups.renameFile')}
                  disabled={busyId === m.id}
                  onClick={() => startRename(m)}
                >
                  {busyId === m.id && editingId === m.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Pencil className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  className="habits-group-icon-btn danger"
                  title={t('assess.delete')}
                  disabled={busyId === m.id}
                  onClick={() => void handleDelete(m.id, m.fileName)}
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
