import { apiFetch } from './http'
import { withBackendReady } from './backendReady'
import type { HabitGroup } from '../utils/habitHelpers'

export type { HabitGroup }

export interface HabitGroupMaterialDto {
  id: number
  groupId: number
  fileName: string
  contentType: string
  size: number
  hasText: boolean
  textLength: number
  source?: 'group'
  createdAt: string
  warning?: string | null
}

function parseErrorBody(text: string): string {
  const raw = (text || '').trim()
  if (!raw) return ''
  try {
    const j = JSON.parse(raw) as { title?: string; detail?: string; message?: string }
    return j.detail || j.message || j.title || raw
  } catch {
    return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw
  }
}

export async function listHabitGroups(): Promise<HabitGroup[]> {
  const res = await apiFetch('/habit-group')
  if (!res.ok) throw new Error(await res.text() || 'Failed to list groups')
  return res.json()
}

export async function createHabitGroup(body: {
  name: string
  description?: string
}): Promise<HabitGroup> {
  const res = await apiFetch('/habit-group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text() || 'Failed to create group')
  return res.json()
}

export async function updateHabitGroup(
  id: number,
  body: { name?: string; description?: string },
): Promise<void> {
  const res = await apiFetch(`/habit-group/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text() || 'Failed to update group')
}

export async function deleteHabitGroup(id: number): Promise<void> {
  const res = await apiFetch(`/habit-group/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete group')
}

export async function moveHabitToGroup(habitId: number, groupId: number | null): Promise<void> {
  const res = await apiFetch('/habit-group/move', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ habitId, groupId }),
  })
  if (!res.ok) throw new Error(await res.text() || 'Failed to move habit')
}

export async function listGroupMaterials(groupId: number): Promise<HabitGroupMaterialDto[]> {
  const res = await apiFetch(`/habit-group/${groupId}/materials`)
  if (!res.ok) throw new Error(await res.text() || 'Failed to list group materials')
  return res.json()
}

/**
 * Hold the file locally, wake the backend if sleeping (Render cold start), then POST
 * via same-origin apiFetch (matches habit material upload).
 */
export async function uploadGroupMaterial(
  groupId: number,
  file: File,
  onStatus?: (message: string) => void,
): Promise<HabitGroupMaterialDto> {
  if (file.size <= 0) throw new Error('文件是空的')
  if (file.size > 8 * 1024 * 1024) {
    throw new Error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 8MB`)
  }

  return withBackendReady(
    async () => {
      onStatus?.('正在上传…')
      const form = new FormData()
      form.append('file', file)
      const res = await apiFetch(`/habit-group/${groupId}/materials`, {
        method: 'POST',
        body: form,
      })
      if (res.status === 401) throw new Error('登录已过期，请重新登录后再上传')
      if (res.status === 413) throw new Error('文件太大（请压缩到 8MB 以内）')
      if (res.status === 404) throw new Error('组不存在，或后端尚未部署习惯组上传接口')
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

export async function deleteGroupMaterial(groupId: number, materialId: number): Promise<void> {
  const res = await apiFetch(`/habit-group/${groupId}/materials/${materialId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Delete failed')
}
