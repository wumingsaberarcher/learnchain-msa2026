import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Cpu,
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

export default function CanalAdmin() {
  const { t, language } = useTranslation()
  const currentUser = useHabitStore((s) => s.currentUser)
  const isSuper = isSuperAdminRole(currentUser?.role)
  const companion = useCompanionStore()

  const [tab, setTab] = useState<Tab>('bond')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  const uploadRef = useRef<HTMLInputElement>(null)
  const attachRef = useRef<HTMLInputElement>(null)
  const [attachId, setAttachId] = useState<number | null>(null)

  const zh = language.startsWith('zh')

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
    try {
      await reseedCanalKnowledge()
      await loadKb()
      await loadDebug()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reseed_failed')
    } finally {
      setBusy(false)
    }
  }

  const onUploadLit = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        await uploadCanalKnowledgeFile(file, {
          category: kbGroup === 'all' ? 'military' : kbGroup,
          titleZh: file.name.replace(/\.[^.]+$/, ''),
          minTrustLevel: 1,
        })
      }
      await loadKb()
      await loadDebug()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload_failed')
    } finally {
      setBusy(false)
    }
  }

  const onAttach = async (files: FileList | null) => {
    if (!files?.length || attachId == null) return
    setBusy(true)
    setError(null)
    try {
      await uploadCanalKnowledgeToEntry(attachId, files[0])
      setAttachId(null)
      await loadKb()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'attach_failed')
    } finally {
      setBusy(false)
    }
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
                const files = e.target.files
                e.target.value = ''
                void onUploadLit(files)
              }}
            />
            <input
              ref={attachRef}
              type="file"
              accept=".pdf,.docx,.doc,.md,.txt,application/pdf,text/plain"
              hidden
              onChange={(e) => {
                const files = e.target.files
                e.target.value = ''
                void onAttach(files)
              }}
            />
            <div className="canal-admin-actions">
              <button type="button" onClick={openCreate}><Plus className="w-4 h-4" /> {t('canalAdmin.addEntry')}</button>
              <button type="button" onClick={() => uploadRef.current?.click()}><Upload className="w-4 h-4" /> {t('canalAdmin.uploadLit')}</button>
              <button type="button" onClick={() => void reseed()}><RefreshCw className="w-4 h-4" /> {t('canalAdmin.reseed')}</button>
              <input
                value={kbFilter}
                onChange={(e) => setKbFilter(e.target.value)}
                placeholder={t('canalAdmin.filterKb')}
              />
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
                  <label>entryKey<input value={form.entryKey || ''} disabled={!!editing?.isBuiltin} onChange={(e) => setForm({ ...form, entryKey: e.target.value })} /></label>
                  <label>category
                    <select value={form.category || 'military'} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      <option value="identity">{t('canalAdmin.groupIdentity')}</option>
                      <option value="military">{t('canalAdmin.groupMilitary')}</option>
                      <option value="other">{t('canalAdmin.groupOther')}</option>
                    </select>
                  </label>
                  <label>minTrust<input type="number" min={0} max={4} value={form.minTrustLevel ?? 0} onChange={(e) => setForm({ ...form, minTrustLevel: Number(e.target.value) })} /></label>
                  <label>section<input value={form.section || ''} onChange={(e) => setForm({ ...form, section: e.target.value })} /></label>
                  <label>sortOrder<input type="number" value={form.sortOrder ?? 0} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></label>
                  <label className="check"><input type="checkbox" checked={form.isActive !== false} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> active</label>
                </div>
                <label>titleZh<input value={form.titleZh || ''} onChange={(e) => setForm({ ...form, titleZh: e.target.value })} /></label>
                <label>titleEn<input value={form.titleEn || ''} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} /></label>
                <label>bodyZh<textarea rows={4} value={form.bodyZh || ''} onChange={(e) => setForm({ ...form, bodyZh: e.target.value })} /></label>
                <label>bodyEn<textarea rows={4} value={form.bodyEn || ''} onChange={(e) => setForm({ ...form, bodyEn: e.target.value })} /></label>
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
                        <div>
                          <strong>{zh ? (row.titleZh || row.titleEn) : (row.titleEn || row.titleZh)}</strong>
                          <span>
                            T≥{row.minTrustLevel} · {row.section || '—'}
                            {row.isBuiltin ? ' · builtin' : ''}
                            {row.hasDocument ? ` · ${t('canalAdmin.hasDoc', { n: row.textLength ?? 0 })}` : ''}
                          </span>
                          <small>{row.entryKey}{row.fileName ? ` · ${row.fileName}` : ''}</small>
                        </div>
                        <div className="canal-admin-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setAttachId(row.id)
                              attachRef.current?.click()
                            }}
                          >
                            <Upload className="w-3.5 h-3.5" /> {t('canalAdmin.attachFile')}
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
