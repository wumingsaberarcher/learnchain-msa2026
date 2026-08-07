import { apiFetch, authHeaders, getAuthToken, handleUnauthorized } from './http'
import { resolveUploadApiBase } from '../config/api'
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

const MAX_MATERIAL_BYTES = 8 * 1024 * 1024

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

export async function uploadHabitMaterial(habitId: number, file: File): Promise<HabitMaterialDto> {
  const token = getAuthToken()
  if (!token) {
    handleUnauthorized()
    throw new Error('登录已过期，请重新登录后再上传')
  }
  if (file.size > MAX_MATERIAL_BYTES) {
    throw new Error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 8MB`)
  }

  const form = new FormData()
  form.append('file', file, file.name)

  // Bypass Vercel rewrite body limit by posting straight to Render in production.
  const base = resolveUploadApiBase()
  let res: Response
  try {
    res = await fetch(`${base}/habit/${habitId}/materials`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('无法连接服务器上传文件。请确认后端已唤醒后重试。')
    }
    throw err
  }

  if (res.status === 401) {
    handleUnauthorized()
    throw new Error('登录已过期，请重新登录后再上传')
  }
  if (res.status === 413) {
    throw new Error('文件太大，上传被拦截（请压缩到 8MB 以内）')
  }
  if (!res.ok) {
    throw new Error(parseErrorBody(await res.text()) || `Upload failed (${res.status})`)
  }
  return res.json()
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
