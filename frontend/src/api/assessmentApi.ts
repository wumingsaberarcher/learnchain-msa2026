import { apiFetch, authHeaders } from './http'
import type { AssessmentDifficulty } from '../utils/habitHelpers'

export interface HabitMaterialDto {
  id: number
  habitId: number
  fileName: string
  contentType: string
  size: number
  hasText: boolean
  textLength: number
  createdAt: string
  warning?: string | null
}

export interface AssessmentOption {
  id: string
  text: string
}

export interface AssessmentQuestion {
  id: string
  type: 'mcq' | 'short' | string
  prompt: string
  options?: AssessmentOption[]
  correctOptionId?: string
  referenceAnswer?: string
  maxScore: number
}

export interface AssessmentHighlight {
  start: number
  end: number
  reason: string
}

export interface AssessmentDeduction {
  reason: string
  points: number
}

export interface AssessmentItemResult {
  questionId: string
  correct: boolean
  score: number
  maxScore: number
  explanation: string
  correctOptionId?: string
  highlights?: AssessmentHighlight[]
  deductions?: AssessmentDeduction[]
}

export interface AssessmentGradeResult {
  passed: boolean
  difficulty: AssessmentDifficulty | string
  correctCount: number
  total: number
  ratio: number
  summary: string
  critique: string
  results: AssessmentItemResult[]
  affection?: {
    awarded: number
    points: number
    tierKey?: string
    gainedToday?: number
    dailyCap?: number
  }
}

function parseErrorBody(text: string): string {
  if (!text?.trim()) return ''
  try {
    const err = JSON.parse(text) as { error?: string; message?: string; title?: string }
    return err.error || err.message || err.title || text
  } catch {
    return text
  }
}

export async function listHabitMaterials(habitId: number): Promise<HabitMaterialDto[]> {
  const res = await apiFetch(`/habit/${habitId}/materials`)
  if (!res.ok) throw new Error(await res.text() || 'Failed to list materials')
  return res.json()
}

/**
 * Same path as the last known-good build (7164a27): same-origin `/api` + multipart FormData.
 * Do not set Content-Type — the browser must add the multipart boundary.
 */
export async function uploadHabitMaterial(
  habitId: number,
  file: File,
  onStage?: (step: string, detail?: string) => void,
): Promise<HabitMaterialDto> {
  const stage = (step: string, detail?: string) => {
    const line = detail ? `${step} — ${detail}` : step
    console.info('[AssessUpload]', line)
    onStage?.(step, detail)
  }

  stage('1/6 收到文件', `${file.name} (${(file.size / 1024).toFixed(1)} KB, type=${file.type || 'unknown'})`)

  if (file.size <= 0) {
    stage('失败', '文件大小为 0')
    throw new Error('文件是空的')
  }
  if (file.size > 8 * 1024 * 1024) {
    stage('失败', `超过 8MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`)
    throw new Error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 8MB`)
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  stage('2/6 检查登录', token ? `有 token（长度 ${token.length}）` : '没有 token')
  if (!token) {
    throw new Error('未登录或登录态丢失，请重新登录后再上传')
  }

  const path = `/habit/${habitId}/materials`
  stage('3/6 准备请求', `POST ${path} · FormData field=file`)

  const form = new FormData()
  form.append('file', file)

  let res: Response
  try {
    stage('4/6 发送中…', '等待服务器响应')
    res = await apiFetch(path, {
      method: 'POST',
      body: form,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    stage('失败 @发送', msg)
    if (err instanceof TypeError) {
      throw new Error('无法连接服务器。请稍后重试（后端可能正在唤醒）。')
    }
    throw err
  }

  stage('5/6 收到响应', `HTTP ${res.status} ${res.statusText || ''}`.trim())

  if (res.status === 401) {
    stage('失败 @鉴权', 'HTTP 401')
    throw new Error('登录已过期，请重新登录后再上传')
  }
  if (res.status === 413) {
    stage('失败 @体积', 'HTTP 413')
    throw new Error('文件太大（请压缩到 8MB 以内，或拆成更小的 PDF）')
  }
  if (!res.ok) {
    const body = await res.text()
    const parsed = parseErrorBody(body) || `上传失败（HTTP ${res.status}）`
    stage('失败 @服务器', parsed.slice(0, 300))
    throw new Error(parsed)
  }

  let dto: HabitMaterialDto
  try {
    dto = await res.json()
  } catch (err) {
    stage('失败 @解析 JSON', err instanceof Error ? err.message : String(err))
    throw new Error('服务器返回了无法解析的内容')
  }

  stage(
    '6/6 上传成功',
    `id=${dto.id} · hasText=${dto.hasText} · chars=${dto.textLength}${dto.warning ? ` · ${dto.warning}` : ''}`,
  )
  return dto
}

export async function deleteHabitMaterial(habitId: number, materialId: number): Promise<void> {
  const res = await apiFetch(`/habit/${habitId}/materials/${materialId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Delete failed')
}

export async function generateAssessment(body: {
  habitId: number
  apiKey: string
  baseUrl?: string
  model?: string
  language: string
  /** Only these materials are used for question generation. */
  materialIds?: number[]
}): Promise<{ habitId: number; habitName: string; difficulty: string; questions: AssessmentQuestion[] }> {
  const res = await apiFetch('/assessment/generate', {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(async () => ({ error: await res.text() }))
    throw new Error(err.error || 'Generate failed')
  }
  return res.json()
}

export async function gradeAssessment(body: {
  habitId: number
  difficulty: string
  apiKey: string
  baseUrl?: string
  model?: string
  language: string
  answers: Array<{
    questionId: string
    type: string
    selectedOptionId?: string
    textAnswer?: string
    question: AssessmentQuestion
  }>
}): Promise<AssessmentGradeResult> {
  const res = await apiFetch('/assessment/grade', {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(async () => ({ error: await res.text() }))
    throw new Error(err.error || 'Grade failed')
  }
  return res.json()
}
