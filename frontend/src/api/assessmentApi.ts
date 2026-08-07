import { apiFetch, authHeaders, getAuthToken } from './http'
import { API_BASE } from '../config/api'
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

export async function listHabitMaterials(habitId: number): Promise<HabitMaterialDto[]> {
  const res = await apiFetch(`/habit/${habitId}/materials`)
  if (!res.ok) throw new Error(await res.text() || 'Failed to list materials')
  return res.json()
}

export async function uploadHabitMaterial(habitId: number, file: File): Promise<HabitMaterialDto> {
  const token = getAuthToken()
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE}/habit/${habitId}/materials`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    let msg = text
    try {
      const err = JSON.parse(text) as { error?: string; message?: string }
      msg = err.error || err.message || text
    } catch {
      /* plain text body */
    }
    throw new Error(msg || 'Upload failed')
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
