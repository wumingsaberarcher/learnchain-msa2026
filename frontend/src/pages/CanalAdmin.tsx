import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Cpu,
  ChevronDown,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react'
import { useHabitStore } from '../stores/habitStore'
import { useTranslation } from '../stores/settingsStore'
import { isSuperAdminRole } from '../api/adminApi'
import { CANAL_MODEL_URL } from '../components/live2d/canalLive2DConfig'
import { EXPRESSION_PRESETS } from '../components/live2d/canalExpressions'
import { useCompanionStore } from '../stores/companionStore'
import {
  createCanalKnowledge,
  deleteCanalKnowledge,
  fetchCanalDebug,
  getCanalBondUser,
  listCanalBondUsers,
  listCanalKnowledge,
  importLocalCanalKnowledge,
  fetchCnCanalKnowledge,
  reseedCanalKnowledge,
  setCanalBond,
  updateCanalKnowledge,
  uploadCanalKnowledgeFile,
  uploadCanalKnowledgeToEntry,
  type CanalBondDetail,
  type CanalBondUser,
  type CanalDebugSnapshot,
  type CanalKnowledgeEntry,
} from '../api/canalAdminApi'
import '../styles/canal-admin.css'

type Tab = 'bond' | 'knowledge' | 'live2d' | 'runtime'
type KbGroup = 'all' | 'identity' | 'military' | 'other'

const emptyForm = (): Partial<CanalKnowledgeEntry> => ({
  entryKey: '',
  category: 'military',
  titleZh: '',
  titleEn: '',
  bodyZh: '',
  bodyEn: '',
  minTrustLevel: 0,
  section: '',
  isActive: true,
  sortOrder: 0,
})

function categoryLabel(cat: string, zh: boolean) {
  if (cat === 'identity') return zh ? '角色身份' : 'Identity'
  if (cat === 'military') return zh ? '军事知识贮备' : 'Military'
  return zh ? '其他类型' : 'Other'
}

function formatBytes(n?: number) {
  if (n == null || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type StatusTone = 'info' | 'ok' | 'err'
type StatusLine = { id: number; tone: StatusTone; text: string; at: number }

function TipLabel({
  label,
  tip,
  children,
  className,
}: {
  label: string
  tip: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={className} title={tip}>
      <span className="canal-admin-field-name">
        {label}
        <abbr className="canal-admin-tip" title={tip} aria-label={tip}>?</abbr>
      </span>
      {children}
    </label>
  )
}

export default function CanalAdmin() {
  const { t, language } = useTranslation()
  const currentUser = useHabitStore((s) => s.currentUser)
  const isSuper = isSuperAdminRole(currentUser?.role)
  const companion = useCompanionStore()

  const [tab, setTab] = useState<Tab>('bond')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusLog, setStatusLog] = useState<StatusLine[]>([])
  const statusSeq = useRef(0)
  const [debug, setDebug] = useState<CanalDebugSnapshot | null>(null)

  const [q, setQ] = useState('')
  const [users, setUsers] = useState<CanalBondUser[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<CanalBondDetail | null>(null)
  const [editLevel, setEditLevel] = useState(0)
  const [editAff, setEditAff] = useState(0)
  const [editStateJson, setEditStateJson] = useState('')

  const [kb, setKb] = useState<CanalKnowledgeEntry[]>([])
  const [kbFilter, setKbFilter] = useState('')
  const [kbGroup, setKbGroup] = useState<KbGroup>('all')
  const [editing, setEditing] = useState<CanalKnowledgeEntry | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [formOpen, setFormOpen] = useState(false)
  const [ingestOpen, setIngestOpen] = useState(false)
  const uploadRef = useRef<HTMLInputElement>(null)
  const attachRef = useRef<HTMLInputElement>(null)
  /** Sync ref — file picker onChange can fire before React commits setState(attachId). */
  const attachIdRef = useRef<number | null>(null)

  const zh = language.startsWith('zh')

  const pushStatus = useCallback((tone: StatusTone, text: string) => {
    statusSeq.current += 1
    const line: StatusLine = { id: statusSeq.current, tone, text, at: Date.now() }
    setStatusLog((prev) => [...prev.slice(-40), line])
    if (tone === 'err') setError(text)
    else setError(null)
    if (tone === 'err') console.error('[CanalAdmin]', text)
    else console.info('[CanalAdmin]', text)
  }, [])

  const loadDebug = useCallback(async () => {
    const d = await fetchCanalDebug()
    setDebug(d)
  }, [])

  const loadUsers = useCallback(async (query?: string) => {
    const list = await listCanalBondUsers(query)
    setUsers(list)
  }, [])

  const loadKb = useCallback(async () => {
    const rows = await listCanalKnowledge({ includeInactive: true })
    setKb(rows)
  }, [])

  useEffect(() => {
    if (!isSuper) return
    void (async () => {
      setBusy(true)
      setError(null)
      try {
        await Promise.all([loadDebug(), loadUsers(), loadKb()])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'load_failed')
      } finally {
        setBusy(false)
      }
    })()
  }, [isSuper, loadDebug, loadUsers, loadKb])

  const selectUser = async (id: number) => {
    setSelectedId(id)
    setBusy(true)
    setError(null)
    try {
      const d = await getCanalBondUser(id)
      setDetail(d)
      setEditLevel(d.trustLevel)
      setEditAff(d.companionAffection)
      setEditStateJson(d.curriculumStateJson || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load_user_failed')
    } finally {
      setBusy(false)
    }
  }

  const saveBond = async () => {
    if (!detail?.canEdit) return
    setBusy(true)
    setError(null)
    try {
      await setCanalBond(detail.id, {
        trustLevel: editLevel,
        companionAffection: editAff,
        curriculumStateJson: editStateJson.trim() || undefined,
        refreshEvaluation: true,
      })
      await selectUser(detail.id)
      await loadUsers(q)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save_failed')
    } finally {
      setBusy(false)
    }
  }

  const resetInject = async () => {
    if (!detail?.canEdit) return
    setBusy(true)
    try {
      await setCanalBond(detail.id, { resetInjectToday: true })
      await selectUser(detail.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reset_failed')
    } finally {
      setBusy(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (row: CanalKnowledgeEntry) => {
    setEditing(row)
    setForm({ ...row })
    setFormOpen(true)
  }

  const saveKb = async () => {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        entryKey: form.entryKey,
        category: form.category || 'custom',
        titleZh: form.titleZh || '',
        titleEn: form.titleEn || '',
        bodyZh: form.bodyZh || '',
        bodyEn: form.bodyEn || '',
        minTrustLevel: Number(form.minTrustLevel) || 0,
        section: form.section || '',
        isActive: form.isActive !== false,
        sortOrder: Number(form.sortOrder) || 0,
      }
      if (editing) await updateCanalKnowledge(editing.id, payload)
      else await createCanalKnowledge(payload)
      setEditing(null)
      setForm(emptyForm())
      setFormOpen(false)
      await loadKb()
      await loadDebug()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'kb_save_failed')
    } finally {
      setBusy(false)
    }
  }

  const removeKb = async (row: CanalKnowledgeEntry) => {
    if (!confirm(zh ? `删除/停用「${row.titleZh || row.entryKey}」？` : `Delete/deactivate "${row.titleEn || row.entryKey}"?`))
      return
    setBusy(true)
    try {
      await deleteCanalKnowledge(row.id)
      await loadKb()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'kb_delete_failed')
    } finally {
      setBusy(false)
    }
  }

  const reseed = async () => {
    setBusy(true)
    setIngestOpen(false)
    pushStatus('info', zh ? '同步目录中…' : 'Syncing catalog…')
    try {
      const r = await reseedCanalKnowledge()
      pushStatus('ok', zh ? `目录同步完成（${r.count} 条）` : `Catalog synced (${r.count})`)
      await loadKb()
      await loadDebug()
    } catch (e) {
      pushStatus('err', e instanceof Error ? e.message : 'reseed_failed')
    } finally {
      setBusy(false)
    }
  }

  const importLocal = async () => {
    setBusy(true)
    setIngestOpen(false)
    pushStatus('info', zh ? '正在导入 App_Data/canal-pdfs…' : 'Importing App_Data/canal-pdfs…')
    try {
      const report = await importLocalCanalKnowledge()
      const failed = report.results.filter((r) => !r.ok)
      if (failed.length) {
        pushStatus(
          'err',
          zh
            ? `本机导入部分失败：成功 ${report.imported}；失败 ${failed.map((f) => `${f.docId}(${f.reason})`).join(', ')}`
            : `Local import partial fail: ok ${report.imported}; failed ${failed.map((f) => `${f.docId}(${f.reason})`).join(', ')}`,
        )
      } else {
        pushStatus('ok', zh ? `本机导入完成：${report.imported} 条` : `Local import done: ${report.imported}`)
      }
      await loadKb()
      await loadDebug()
    } catch (e) {
      pushStatus('err', e instanceof Error ? e.message : 'import_local_failed')
    } finally {
      setBusy(false)
    }
  }

  const fetchCn = async () => {
    setBusy(true)
    setIngestOpen(false)
    pushStatus('info', zh ? '正在抓取中国公开文献…' : 'Fetching CN open sources…')
    try {
      const report = await fetchCnCanalKnowledge()
      const failNote = report.failedCount
        ? (zh ? `；失败 ${report.failedUrls.map((f) => `${f.docId}(${f.reason})`).join(', ')}` : `; failed ${report.failedUrls.map((f) => `${f.docId}(${f.reason})`).join(', ')}`)
        : ''
      pushStatus(
        report.failedCount ? 'err' : 'ok',
        zh
          ? `中国文献：新增 ${report.newlyFetched} / 成功 ${report.successCount} / 尝试 ${report.cnSourcesAttempted}${failNote}`
          : `CN sources: new ${report.newlyFetched} / ok ${report.successCount} / tried ${report.cnSourcesAttempted}${failNote}`,
      )
      await loadKb()
      await loadDebug()
    } catch (e) {
      pushStatus('err', e instanceof Error ? e.message : 'fetch_cn_failed')
    } finally {
      setBusy(false)
    }
  }

  const onUploadLit = async (files: File[]) => {
    if (!files.length) return
    setBusy(true)
    setIngestOpen(false)
    pushStatus('info', zh ? `已选择 ${files.length} 个文件，开始上传…` : `Selected ${files.length} file(s), uploading…`)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        pushStatus(
          'info',
          zh
            ? `(${i + 1}/${files.length}) 上传「${file.name}」(${formatBytes(file.size)}) → 服务器抽取正文…`
            : `(${i + 1}/${files.length}) Uploading "${file.name}" (${formatBytes(file.size)}) → extracting…`,
        )
        const result = await uploadCanalKnowledgeFile(file, {
          category: kbGroup === 'all' ? 'military' : kbGroup,
          titleZh: file.name.replace(/\.[^.]+$/, ''),
          minTrustLevel: 1,
        })
        pushStatus(
          'ok',
          result.message
            || (zh
              ? `成功：${result.fileName} · ${result.textLength ?? 0} 字`
              : `OK: ${result.fileName} · ${result.textLength ?? 0} chars`),
        )
      }
      await loadKb()
      await loadDebug()
    } catch (e) {
      pushStatus('err', e instanceof Error ? e.message : 'upload_failed')
    } finally {
      setBusy(false)
    }
  }

  const onAttach = async (files: File[], entryIdExplicit?: number | null) => {
    const entryId = entryIdExplicit ?? attachIdRef.current
    // Empty = user cancelled, or a spurious change after clearing input.value — ignore silently.
    if (!files.length) return
    if (entryId == null) {
      pushStatus(
        'err',
        zh
          ? '挂载失败：未绑定目标条目（请重新点「挂载/更换」再选文件）'
          : 'Attach failed: no target entry (click Attach again)',
      )
      return
    }
    const file = files[0]!
    const target = kb.find((r) => r.id === entryId)
    setBusy(true)
    pushStatus(
      'info',
      zh
        ? `挂载到「${target?.titleZh || target?.entryKey || entryId}」：已选 ${file.name} (${formatBytes(file.size)})，上传并抽取中…`
        : `Attach to "${target?.titleEn || target?.entryKey || entryId}": ${file.name} (${formatBytes(file.size)})…`,
    )
    try {
      const result = await uploadCanalKnowledgeToEntry(entryId, file)
      pushStatus('ok', result.message || (zh ? '挂载成功' : 'Attached'))
      attachIdRef.current = null
      await loadKb()
      await loadDebug()
    } catch (e) {
      pushStatus('err', e instanceof Error ? e.message : 'attach_failed')
    } finally {
      setBusy(false)
    }
  }

  const startAttach = (row: CanalKnowledgeEntry) => {
    // Must open the file picker in the same user-gesture stack (no rAF/setTimeout).
    attachIdRef.current = row.id
    attachRef.current?.click()
    pushStatus(
      'info',
      zh
        ? `准备挂载到「${row.titleZh || row.entryKey}」— 请选择 pdf/docx/md/txt（上限约 40MB）`
        : `Ready to attach to "${row.titleEn || row.entryKey}" — pick pdf/docx/md/txt (max ~40MB)`,
    )
  }

  if (!currentUser) return <Navigate to="/" replace />
  if (!isSuper) {
    return (
      <div className="canal-admin-page">
        <div className="canal-admin-card">
          <h1>{t('canalAdmin.forbidden')}</h1>
          <p>{t('canalAdmin.forbiddenHint')}</p>
          <Link to="/admin">{t('canalAdmin.backAdmin')}</Link>
        </div>
      </div>
    )
  }

  const filteredKb = kb.filter((row) => {
    if (kbGroup !== 'all' && row.category !== kbGroup) return false
    if (!kbFilter.trim()) return true
    const f = kbFilter.toLowerCase()
    return (
      row.entryKey.toLowerCase().includes(f)
      || row.category.toLowerCase().includes(f)
      || row.titleZh.toLowerCase().includes(f)
      || row.titleEn.toLowerCase().includes(f)
      || row.section.toLowerCase().includes(f)
      || (row.fileName || '').toLowerCase().includes(f)
    )
  })

  const grouped = {
    identity: filteredKb.filter((r) => r.category === 'identity'),
    military: filteredKb.filter((r) => r.category === 'military'),
    other: filteredKb.filter((r) => r.category === 'other'),
  }

  return (
    <div className="canal-admin-page">
      <div className="canal-admin-card">
        <header className="canal-admin-header">
          <div>
            <Link to="/admin" className="canal-admin-back">
              <ArrowLeft className="w-4 h-4" /> {t('canalAdmin.backAdmin')}
            </Link>
            <h1>
              <Sparkles className="w-5 h-5" /> {t('canalAdmin.title')}
            </h1>
            <p>{zh ? debug?.identity.summaryZh : debug?.identity.summaryEn}</p>
          </div>
          {busy && <Loader2 className="w-5 h-5 animate-spin canal-admin-spin" />}
        </header>

        {error && <div className="canal-admin-error" role="alert">{error}</div>}
        {statusLog.length > 0 && tab === 'knowledge' && (
          <div className="canal-admin-status-log" aria-live="polite">
            <div className="canal-admin-status-log-head">
              <strong>{t('canalAdmin.statusLog')}</strong>
              <button type="button" className="ghost" onClick={() => setStatusLog([])}>{t('canalAdmin.clearLog')}</button>
            </div>
            <ul>
              {statusLog.slice(-12).map((line) => (
                <li key={line.id} className={`tone-${line.tone}`}>
                  <span className="canal-admin-status-time">{new Date(line.at).toLocaleTimeString()}</span>
                  {line.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <nav className="canal-admin-tabs">
          {(
            [
              ['bond', Shield, t('canalAdmin.tabBond')],
              ['knowledge', BookOpen, t('canalAdmin.tabKnowledge')],
              ['live2d', Cpu, t('canalAdmin.tabLive2d')],
              ['runtime', Zap, t('canalAdmin.tabRuntime')],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'on' : ''}
              onClick={() => setTab(id)}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </nav>

        {tab === 'bond' && (
          <section className="canal-admin-split">
            <div className="canal-admin-pane">
              <div className="canal-admin-row">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('canalAdmin.searchUser')}
                />
                <button type="button" onClick={() => void loadUsers(q)}>{t('canalAdmin.search')}</button>
              </div>
              <ul className="canal-admin-user-list">
                {users.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className={selectedId === u.id ? 'on' : ''}
                      onClick={() => void selectUser(u.id)}
                    >
                      <strong>{u.username}</strong>
                      <span>T{u.trustLevel} · {u.companionAffection}pt · {u.affectionTierKey}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="canal-admin-pane">
              {!detail ? (
                <p className="canal-admin-muted">{t('canalAdmin.pickUser')}</p>
              ) : (
                <>
                  <h2>{detail.username}</h2>
                  <p className="canal-admin-muted">{detail.email} · {detail.role}</p>
                  <p className="canal-admin-eval">{detail.canalEvaluation}</p>
                  <label>
                    {t('canalAdmin.trustLevel')} (0–4)
                    <input
                      type="number"
                      min={0}
                      max={4}
                      value={editLevel}
                      disabled={!detail.canEdit}
                      onChange={(e) => setEditLevel(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    {t('canalAdmin.affection')} (0–{detail.companionAffectionMax})
                    <input
                      type="number"
                      min={0}
                      max={detail.companionAffectionMax}
                      value={editAff}
                      disabled={!detail.canEdit}
                      onChange={(e) => setEditAff(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    {t('canalAdmin.curriculumState')}
                    <textarea
                      rows={5}
                      value={editStateJson}
                      disabled={!detail.canEdit}
                      onChange={(e) => setEditStateJson(e.target.value)}
                    />
                  </label>
                  <p className="canal-admin-muted">{t('canalAdmin.curriculumStateHint')}</p>
                  <div className="canal-admin-actions">
                    <button type="button" disabled={!detail.canEdit || busy} onClick={() => void saveBond()}>
                      {t('canalAdmin.saveBond')}
                    </button>
                    <button type="button" disabled={!detail.canEdit || busy} onClick={() => void resetInject()}>
                      {t('canalAdmin.resetInject')}
                    </button>
                  </div>
                  {!detail.canEdit && (
                    <p className="canal-admin-muted">{t('canalAdmin.cannotEditSuper')}</p>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {tab === 'knowledge' && (
          <section>
            <input
              ref={uploadRef}
              type="file"
              accept=".pdf,.docx,.doc,.md,.txt,application/pdf,text/plain"
              multiple
              hidden
              onChange={(e) => {
                const picked = e.target.files?.length ? Array.from(e.target.files) : []
                e.target.value = ''
                if (!picked.length) return
                void onUploadLit(picked)
              }}
            />
            <input
              ref={attachRef}
              type="file"
              accept=".pdf,.docx,.doc,.md,.txt,application/pdf,text/plain"
              hidden
              onChange={(e) => {
                const picked = e.target.files?.length ? Array.from(e.target.files) : []
                const entryId = attachIdRef.current
                e.target.value = ''
                if (!picked.length) return
                void onAttach(picked, entryId)
              }}
            />
            <div className="canal-admin-toolbar">
              <div className="canal-admin-actions canal-admin-toolbar-primary">
                <button type="button" onClick={openCreate}><Plus className="w-4 h-4" /> {t('canalAdmin.addEntry')}</button>
                <div className={`canal-admin-ingest ${ingestOpen ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="canal-admin-ingest-trigger"
                    disabled={busy}
                    onClick={() => setIngestOpen((v) => !v)}
                    aria-expanded={ingestOpen}
                  >
                    <Upload className="w-4 h-4" /> {t('canalAdmin.ingestMenu')}
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {ingestOpen && (
                    <div className="canal-admin-ingest-panel" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        disabled={busy}
                        onClick={() => {
                          setIngestOpen(false)
                          uploadRef.current?.click()
                        }}
                      >
                        <Upload className="w-4 h-4" />
                        <span>
                          <strong>{t('canalAdmin.uploadLit')}</strong>
                          <small>{t('canalAdmin.uploadLitHint')}</small>
                        </span>
                      </button>
                      <button type="button" role="menuitem" disabled={busy} onClick={() => void reseed()}>
                        <RefreshCw className="w-4 h-4" />
                        <span>
                          <strong>{t('canalAdmin.reseed')}</strong>
                          <small>{t('canalAdmin.reseedHint')}</small>
                        </span>
                      </button>
                      <button type="button" role="menuitem" disabled={busy} onClick={() => void importLocal()} title={t('canalAdmin.importLocalHint')}>
                        <FileText className="w-4 h-4" />
                        <span>
                          <strong>{t('canalAdmin.importLocal')}</strong>
                          <small>{t('canalAdmin.importLocalHint')}</small>
                        </span>
                      </button>
                      <button type="button" role="menuitem" disabled={busy} onClick={() => void fetchCn()} title={t('canalAdmin.fetchCnHint')}>
                        <BookOpen className="w-4 h-4" />
                        <span>
                          <strong>{t('canalAdmin.fetchCn')}</strong>
                          <small>{t('canalAdmin.fetchCnHint')}</small>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
                <input
                  value={kbFilter}
                  onChange={(e) => setKbFilter(e.target.value)}
                  placeholder={t('canalAdmin.filterKb')}
                />
              </div>
            </div>
            <div className="canal-admin-tabs canal-admin-subtabs">
              {([
                ['all', t('canalAdmin.groupAll')],
                ['identity', t('canalAdmin.groupIdentity')],
                ['military', t('canalAdmin.groupMilitary')],
                ['other', t('canalAdmin.groupOther')],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" className={kbGroup === id ? 'on' : ''} onClick={() => setKbGroup(id)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="canal-admin-muted">
              {t('canalAdmin.kbHint', { n: debug?.curriculum.knowledgeActive ?? kb.filter((x) => x.isActive).length })}
            </p>

            {(formOpen) && (
              <div className="canal-admin-form">
                <h3>{editing ? t('canalAdmin.editEntry') : t('canalAdmin.addEntry')}</h3>
                <div className="canal-admin-form-grid">
                  <TipLabel label={t('canalAdmin.field.entryKey')} tip={t('canalAdmin.tip.entryKey')}>
                    <input value={form.entryKey || ''} disabled={!!editing?.isBuiltin} onChange={(e) => setForm({ ...form, entryKey: e.target.value })} />
                  </TipLabel>
                  <TipLabel label={t('canalAdmin.field.category')} tip={t('canalAdmin.tip.category')}>
                    <select value={form.category || 'military'} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      <option value="identity">{t('canalAdmin.groupIdentity')}</option>
                      <option value="military">{t('canalAdmin.groupMilitary')}</option>
                      <option value="other">{t('canalAdmin.groupOther')}</option>
                    </select>
                  </TipLabel>
                  <TipLabel label={t('canalAdmin.field.minTrust')} tip={t('canalAdmin.tip.minTrust')}>
                    <input type="number" min={0} max={4} value={form.minTrustLevel ?? 0} onChange={(e) => setForm({ ...form, minTrustLevel: Number(e.target.value) })} />
                  </TipLabel>
                  <TipLabel label={t('canalAdmin.field.section')} tip={t('canalAdmin.tip.section')}>
                    <input value={form.section || ''} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="A1 / lore / B" />
                  </TipLabel>
                  <TipLabel label={t('canalAdmin.field.sortOrder')} tip={t('canalAdmin.tip.sortOrder')}>
                    <input type="number" value={form.sortOrder ?? 0} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
                  </TipLabel>
                  <TipLabel label={t('canalAdmin.field.active')} tip={t('canalAdmin.tip.active')} className="check">
                    <input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                  </TipLabel>
                </div>
                <TipLabel label={t('canalAdmin.field.titleZh')} tip={t('canalAdmin.tip.titleZh')}>
                  <input value={form.titleZh || ''} onChange={(e) => setForm({ ...form, titleZh: e.target.value })} />
                </TipLabel>
                <TipLabel label={t('canalAdmin.field.titleEn')} tip={t('canalAdmin.tip.titleEn')}>
                  <input value={form.titleEn || ''} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
                </TipLabel>
                <TipLabel label={t('canalAdmin.field.bodyZh')} tip={t('canalAdmin.tip.bodyZh')}>
                  <textarea rows={4} value={form.bodyZh || ''} onChange={(e) => setForm({ ...form, bodyZh: e.target.value })} />
                </TipLabel>
                <TipLabel label={t('canalAdmin.field.bodyEn')} tip={t('canalAdmin.tip.bodyEn')}>
                  <textarea rows={4} value={form.bodyEn || ''} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} />
                </TipLabel>
                <p className="canal-admin-muted">{t('canalAdmin.formHint')}</p>
                <div className="canal-admin-actions">
                  <button type="button" disabled={busy} onClick={() => void saveKb()}>{t('canalAdmin.saveEntry')}</button>
                  <button type="button" className="ghost" onClick={() => { setEditing(null); setForm(emptyForm()); setFormOpen(false) }}>{t('canalAdmin.cancel')}</button>
                </div>
              </div>
            )}

            {(['identity', 'military', 'other'] as const).map((cat) => {
              const rows = grouped[cat]
              if (kbGroup !== 'all' && kbGroup !== cat) return null
              if (rows.length === 0) return null
              return (
                <div key={cat} className="canal-admin-kb-group">
                  <h3>{categoryLabel(cat, zh)} <span>({rows.length})</span></h3>
                  <ul className="canal-admin-kb-list">
                    {rows.map((row) => (
                      <li key={row.id} className={!row.isActive ? 'off' : ''}>
                        <div className="canal-admin-kb-main">
                          <strong>{zh ? (row.titleZh || row.titleEn) : (row.titleEn || row.titleZh)}</strong>
                          <span>
                            T≥{row.minTrustLevel} · {row.section || '—'}
                            {row.isBuiltin ? ' · builtin' : ''}
                          </span>
                          <small>{row.entryKey}</small>
                          {row.hasDocument || row.fileName ? (
                            <div className="canal-admin-file-chip" title={row.contentType || ''}>
                              <FileText className="w-3.5 h-3.5" />
                              <span>
                                <em>{row.fileName || t('canalAdmin.attachedUnknown')}</em>
                                {' · '}
                                {formatBytes(row.fileSize)}
                                {row.textLength != null && row.textLength > 0
                                  ? ` · ${t('canalAdmin.hasDoc', { n: row.textLength })}`
                                  : ` · ${t('canalAdmin.noExtract')}`}
                              </span>
                            </div>
                          ) : (
                            <div className="canal-admin-file-chip empty">
                              <FileText className="w-3.5 h-3.5" />
                              <span>{t('canalAdmin.noAttachment')}</span>
                            </div>
                          )}
                        </div>
                        <div className="canal-admin-actions">
                          <button type="button" disabled={busy} onClick={() => startAttach(row)}>
                            <Upload className="w-3.5 h-3.5" />
                            {row.hasDocument || row.fileName ? t('canalAdmin.replaceFile') : t('canalAdmin.attachFile')}
                          </button>
                          <button type="button" onClick={() => openEdit(row)}>{t('canalAdmin.edit')}</button>
                          <button type="button" className="danger" onClick={() => void removeKb(row)}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </section>
        )}

        {tab === 'live2d' && (
          <section className="canal-admin-live2d">
            <h2>{t('canalAdmin.live2dTitle')}</h2>
            <dl>
              <dt>modelUrl</dt><dd><code>{debug?.live2d.modelUrl || CANAL_MODEL_URL}</code></dd>
              <dt>cubismCore</dt><dd><code>{debug?.live2d.cubismCore}</code></dd>
              <dt>{t('canalAdmin.runtimeEmotion')}</dt><dd>{companion.emotion} · talking={String(companion.isTalking)} · gal={String(companion.galModeOpen)}</dd>
            </dl>
            <h3>{t('canalAdmin.expressions')}</h3>
            <div className="canal-admin-expr-row">
              {(debug?.live2d.expressions || Object.keys(EXPRESSION_PRESETS)).map((name) => (
                <button key={name} type="button" onClick={() => companion.setEmotion(name as never)}>
                  {name}
                </button>
              ))}
            </div>
            <p className="canal-admin-muted">{debug?.live2d.note}</p>
            <h3>{t('canalAdmin.triggerLogic')}</h3>
            <pre className="canal-admin-pre">{JSON.stringify(debug?.triggers, null, 2)}</pre>
          </section>
        )}

        {tab === 'runtime' && debug && (
          <section>
            <h2>{t('canalAdmin.runtimeTitle')}</h2>
            <div className="canal-admin-stats">
              <div><strong>{debug.curriculum.sourceDocuments}</strong><span>§7 docs</span></div>
              <div><strong>{debug.curriculum.sourcePortals}</strong><span>§8 portals</span></div>
              <div><strong>{debug.curriculum.knowledgeActive}</strong><span>KB active</span></div>
              <div><strong>{debug.config.lessonsToAdvance}</strong><span>lessons/advance</span></div>
              <div><strong>{Math.round(debug.config.stage1InjectChance * 100)}%</strong><span>stage1 RNG</span></div>
            </div>
            <h3>{t('canalAdmin.stages')}</h3>
            <table className="canal-admin-table">
              <thead>
                <tr>
                  <th>Lv</th><th>stage</th><th>address</th><th>echelon</th><th>lore</th>
                </tr>
              </thead>
              <tbody>
                {debug.stages.map((s) => (
                  <tr key={s.level}>
                    <td>{s.level}</td>
                    <td>{s.stageKey}</td>
                    <td>{s.addressKey}</td>
                    <td>{s.echelon}</td>
                    <td>{s.loreKeys.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>{t('canalAdmin.lessons')}</h3>
            <ul>
              {debug.curriculum.lessonCountsByEchelon.map((x) => (
                <li key={x.echelon}>{x.echelon}: {x.count}</li>
              ))}
            </ul>
            <pre className="canal-admin-pre">{JSON.stringify(debug, null, 2)}</pre>
          </section>
        )}
      </div>
    </div>
  )
}
