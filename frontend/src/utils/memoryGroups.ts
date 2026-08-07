import type { UserMemoryItem } from '../api/chatApi'

/** Semantic folders for the Profile long-term memory vault. */
export type MemoryGroupId =
  | 'profile'
  | 'habits'
  | 'study'
  | 'preferences'
  | 'bonds'
  | 'events'
  | 'facts'

export const MEMORY_GROUP_ORDER: MemoryGroupId[] = [
  'profile',
  'habits',
  'study',
  'preferences',
  'bonds',
  'events',
  'facts',
]

export function classifyMemory(m: UserMemoryItem): MemoryGroupId {
  const type = (m.type || '').toLowerCase()
  const key = (m.key || '').toLowerCase()
  const content = (m.content || '').toLowerCase()
  const blob = `${key} ${content}`

  if (type === 'preference' || /prefer|偏好|喜欢|language|theme|语气/.test(blob)) {
    return 'preferences'
  }
  if (type === 'relationship' || /relationship|friend|bond|affection|关系|好感|羁绊/.test(blob)) {
    return 'bonds'
  }
  if (type === 'event' || /event|发生|里程碑|unlock|badge/.test(blob)) {
    return 'events'
  }
  if (
    /user_name|username|^name$|display_name|称呼|昵称/.test(key) ||
    /user'?s name|名字是|名叫|叫我/.test(blob)
  ) {
    return 'profile'
  }
  if (
    /habit|streak|task|todo|check.?in|打卡|习惯|任务|daily|everyday|微习惯/.test(blob)
  ) {
    return 'habits'
  }
  if (
    /study|material|quiz|assess|knowledge|学习|资料|考核|知识|exam|lesson/.test(blob)
  ) {
    return 'study'
  }
  if (type === 'fact') return 'facts'
  return 'facts'
}

export interface MemoryGroupBucket {
  id: MemoryGroupId
  items: UserMemoryItem[]
  latestAt: number
}

export function groupMemories(memories: UserMemoryItem[]): MemoryGroupBucket[] {
  const map = new Map<MemoryGroupId, UserMemoryItem[]>()
  for (const m of memories) {
    const id = classifyMemory(m)
    const list = map.get(id) ?? []
    list.push(m)
    map.set(id, list)
  }

  return MEMORY_GROUP_ORDER
    .map((id) => {
      const items = (map.get(id) ?? []).slice().sort((a, b) => {
        const ta = Date.parse(a.updatedAt) || 0
        const tb = Date.parse(b.updatedAt) || 0
        return tb - ta
      })
      const latestAt = items.reduce((max, m) => Math.max(max, Date.parse(m.updatedAt) || 0), 0)
      return { id, items, latestAt }
    })
    .filter((g) => g.items.length > 0)
}

export function memoryPreview(m: UserMemoryItem, max = 72): string {
  const text = (m.content || m.key || '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
