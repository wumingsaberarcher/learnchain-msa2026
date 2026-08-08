import { apiFetch, authHeaders } from './http'

async function readError(res: Response) {
  const text = await res.text()
  try {
    const j = JSON.parse(text) as Record<string, unknown>
    const stage = typeof j.stage === 'string' ? `[${j.stage}] ` : ''
    const msg =
      (typeof j.message === 'string' && j.message)
      || (typeof j.detail === 'string' && j.detail)
      || (typeof j.title === 'string' && j.title)
      || text
    const file = typeof j.fileName === 'string' ? ` · ${j.fileName}` : ''
    return `${stage}${msg}${file} (HTTP ${res.status})`
  } catch {
    return (text || res.statusText || 'request_failed') + ` (HTTP ${res.status})`
  }
}

export type CanalUploadResult = {
  ok: boolean
  stage: string
  message: string
  fileName?: string
  fileSize?: number
  textLength?: number
  entry: CanalKnowledgeEntry
}

function parseUploadPayload(data: unknown): CanalUploadResult {
  if (data && typeof data === 'object' && 'entry' in data) {
    const d = data as CanalUploadResult
    return {
      ok: d.ok !== false,
      stage: d.stage || 'done',
      message: d.message || '上传完成',
      fileName: d.fileName,
      fileSize: d.fileSize,
      textLength: d.textLength,
      entry: d.entry,
    }
  }
  // Legacy flat entry response
  const entry = data as CanalKnowledgeEntry
  return {
    ok: true,
    stage: 'done',
    message: entry.fileName
      ? `已挂载「${entry.fileName}」，抽取 ${entry.textLength ?? 0} 字`
      : '上传完成',
    fileName: entry.fileName,
    fileSize: entry.fileSize,
    textLength: entry.textLength,
    entry,
  }
}

export interface CanalDebugSnapshot {
  identity: {
    name: string
    nameZh: string
    summaryZh: string
    summaryEn: string
  }
  live2d: {
    modelUrl: string
    cubismCore: string
    expressions: string[]
    note: string
  }
  triggers: Record<string, unknown>
  stages: Array<{
    level: number
    stageKey: string
    addressKey: string
    echelon: string
    loreKeys: string[]
  }>
  curriculum: {
    lessonCountsByEchelon: Array<{ echelon: string; count: number }>
    sourceDocuments: number
    sourcePortals: number
    knowledgeActive: number
  }
  affection: { maxPoints: number; dailyCap: number }
  config: { stage1InjectChance: number; lessonsToAdvance: number }
}

export interface CanalBondUser {
  id: number
  username: string
  email: string
  role: string
  trustLevel: number
  trustStageKey: string
  companionAffection: number
  affectionTierKey: string
  curriculumCompleted: number
  curriculumInjected: number
  injectCountToday: number
  canalEvaluation?: string
  canEdit: boolean
}

export interface CanalBondDetail extends Omit<CanalBondUser, 'curriculumCompleted' | 'curriculumInjected'> {
  trustAddressKey: string
  currentEchelon: string
  companionAffectionMax: number
  affectionGainedToday: number
  curriculumStateJson: string
  /** Lesson id lists (detail endpoint), not counts. */
  curriculumCompleted: string[]
  curriculumInjected: string[]
  injectDayUtc?: string | null
  loreKeys: string[]
}

export interface CanalKnowledgeEntry {
  id: number
  entryKey: string
  category: string
  titleZh: string
  titleEn: string
  bodyZh: string
  bodyEn: string
  minTrustLevel: number
  section: string
  isBuiltin: boolean
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  fileName?: string
  contentType?: string
  fileSize?: number
  hasDocument?: boolean
  textLength?: number
}

export async function fetchCanalDebug(): Promise<CanalDebugSnapshot> {
  const res = await apiFetch('/admin/canal/debug')
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function listCanalBondUsers(q?: string): Promise<CanalBondUser[]> {
  const path = q?.trim()
    ? `/admin/canal/users?q=${encodeURIComponent(q.trim())}`
    : '/admin/canal/users'
  const res = await apiFetch(path)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function getCanalBondUser(id: number): Promise<CanalBondDetail> {
  const res = await apiFetch(`/admin/canal/users/${id}`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export type CurriculumStageGap = {
  stage: number
  echelon: string
  total: number
  dispatched: number
  missing: number
}

export type CurriculumBackfill = {
  ran: boolean
  reason: string
  created: number
  createdLessonIds: string[]
  gaps: CurriculumStageGap[]
}

export type CanalBondSaveResult = {
  message: string
  trustLevel: number
  trustStageKey: string
  companionAffection: number
  affectionTierKey: string
  canalEvaluation?: string | null
  backfill?: CurriculumBackfill
}

export async function setCanalBond(
  id: number,
  body: {
    trustLevel?: number
    companionAffection?: number
    curriculumStateJson?: string
    resetInjectToday?: boolean
    refreshEvaluation?: boolean
  },
): Promise<CanalBondSaveResult> {
  const res = await apiFetch(`/admin/canal/users/${id}/bond`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function listCanalKnowledge(opts?: {
  category?: string
  includeInactive?: boolean
}): Promise<CanalKnowledgeEntry[]> {
  const params = new URLSearchParams()
  if (opts?.category) params.set('category', opts.category)
  if (opts?.includeInactive === false) params.set('includeInactive', 'false')
  const qs = params.toString()
  const res = await apiFetch(`/admin/canal/knowledge${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function createCanalKnowledge(body: Partial<CanalKnowledgeEntry> & {
  category: string
  titleZh: string
}): Promise<CanalKnowledgeEntry> {
  const res = await apiFetch('/admin/canal/knowledge', {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function updateCanalKnowledge(
  id: number,
  body: Partial<CanalKnowledgeEntry>,
): Promise<CanalKnowledgeEntry> {
  const res = await apiFetch(`/admin/canal/knowledge/${id}`, {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function deleteCanalKnowledge(id: number): Promise<void> {
  const res = await apiFetch(`/admin/canal/knowledge/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await readError(res))
}

export async function reseedCanalKnowledge(): Promise<{ count: number }> {
  const res = await apiFetch('/admin/canal/knowledge/reseed', {
    method: 'POST',
    headers: authHeaders(true),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function importLocalCanalKnowledge(): Promise<{
  message: string
  imported: number
  results: Array<{ docId: string; ok: boolean; reason: string; chars?: number; fileName?: string }>
}> {
  const res = await apiFetch('/admin/canal/knowledge/import-local', {
    method: 'POST',
    headers: authHeaders(true),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function fetchCnCanalKnowledge(): Promise<{
  message: string
  cnSourcesAttempted: number
  successCount: number
  newlyFetched: number
  failedCount: number
  failedUrls: Array<{ docId: string; reason: string; url?: string }>
  results: Array<{ docId: string; ok: boolean; reason: string; url?: string; chars?: number }>
}> {
  const res = await apiFetch('/admin/canal/knowledge/fetch-cn', {
    method: 'POST',
    headers: authHeaders(true),
  })
  if (!res.ok) throw new Error(await readError(res))
  return res.json()
}

export async function uploadCanalKnowledgeFile(
  file: File,
  opts?: { category?: string; titleZh?: string; titleEn?: string; minTrustLevel?: number },
): Promise<CanalUploadResult> {
  const form = new FormData()
  form.append('file', file)
  if (opts?.category) form.append('category', opts.category)
  if (opts?.titleZh) form.append('titleZh', opts.titleZh)
  if (opts?.titleEn) form.append('titleEn', opts.titleEn)
  if (opts?.minTrustLevel != null) form.append('minTrustLevel', String(opts.minTrustLevel))
  const res = await apiFetch('/admin/canal/knowledge/upload', {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(await readError(res))
  return parseUploadPayload(await res.json())
}

export async function uploadCanalKnowledgeToEntry(
  id: number,
  file: File,
): Promise<CanalUploadResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await apiFetch(`/admin/canal/knowledge/${id}/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(await readError(res))
  return parseUploadPayload(await res.json())
}
