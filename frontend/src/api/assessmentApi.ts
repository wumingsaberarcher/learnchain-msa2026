import { apiFetch, authHeaders } from './http'
import { withBackendReady } from './backendReady'
import type { AssessmentDifficulty } from '../utils/habitHelpers'

export interface HabitMaterialDto {
  id: number
  habitId?: number
  groupId?: number
  fileName: string
  contentType: string
  size: number
  hasText: boolean
  textLength: number
  createdAt: string
  warning?: string | null
  /** habit | group — used when quiz panel merges shared materials */
  source?: 'habit' | 'group'
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
 * Hold the file locally, wake the backend if sleeping (Render cold start), then POST.
 */
export async function uploadHabitMaterial(
  habitId: number,
  file: File,
  onStatus?: (message: string) => void,
): Promise<HabitMaterialDto> {
  if (file.size <= 0) throw new Error('文件是空的')
  if (file.size > 8 * 1024 * 1024) {
    throw new Error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 8MB`)
  }

  return withBackendReady(
    async () => {
      onStatus?.('正在上传…')
      const form = new FormData()
      form.append('file', file)
      const res = await apiFetch(`/habit/${habitId}/materials`, {
        method: 'POST',
        body: form,
      })
      if (res.status === 401) throw new Error('登录已过期，请重新登录后再上传')
      if (res.status === 413) throw new Error('文件太大（请压缩到 8MB 以内）')
      if (!res.ok) {
        throw new Error(parseErrorBody(await res.text()) || `上传失败（HTTP ${res.status}）`)
      }
      return res.json()
    },
    {
      onWaiting: (elapsed) => {
        const sec = Math.max(1, Math.round(elapsed / 1000))
        onStatus?.(sec > 1 ? `服务器唤醒中…已等待 ${sec}s` : '服务器唤醒中，文件已暂存在本地…')
      },
      onRetry: (attempt) => onStatus?.(`上传中断，正在重试（${attempt}）…`),
    },
  )
}

export async function deleteHabitMaterial(habitId: number, materialId: number): Promise<void> {
  const res = await apiFetch(`/habit/${habitId}/materials/${materialId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Delete failed')
}

export async function generateAssessment(body: {
  habitId: number
  groupId?: number
  practice?: boolean
  difficulty?: string
  apiKey: string
  baseUrl?: string
  model?: string
  language: string
  materialIds?: number[]
  groupMaterialIds?: number[]
}): Promise<{
  habitId: number
  groupId?: number
  practice?: boolean
  habitName: string
  difficulty: string
  questions: AssessmentQuestion[]
}> {
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
  groupId?: number
  practice?: boolean
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
