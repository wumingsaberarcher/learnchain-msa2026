import { apiFetch, authHeaders } from './http'

export type ChatRole = 'user' | 'assistant' | 'system'


export interface ChatMessagePayload {
    role: ChatRole
    content: string
}

export interface ChatActionResult {
    type: string
    summary: string
    habitId?: number
}

export interface ChatResponse {
    reply: string
    actionsExecuted: ChatActionResult[]
    summaryUpdated?: boolean
    affectionAwarded?: number
    affectionPoints?: number
    affectionTierKey?: string
}

export interface ChatHistoryMessage {
    role: ChatRole
    content: string
    createdAt: string
}

export interface ChatHistoryResponse {
    summary: string
    messages: ChatHistoryMessage[]
}

export interface UserMemoryItem {
    id: number
    type: string
    key: string
    content: string
    importance: number
    updatedAt: string
}

export interface AiProviderSettings {
    apiKey: string
    baseUrl: string
    model: string
}

export type ChatZoneType = 'daily' | 'habit'

export interface ChatScopeParam {
    zoneType?: ChatZoneType
    habitId?: number | null
}

function scopeQuery(scope?: ChatScopeParam) {
    const zone = scope?.zoneType === 'habit' && scope.habitId != null && scope.habitId > 0
        ? 'habit'
        : 'daily'
    const params = new URLSearchParams({ zoneType: zone })
    if (zone === 'habit' && scope?.habitId) params.set('habitId', String(scope.habitId))
    return params.toString()
}

export async function sendChat(
    messages: ChatMessagePayload[],
    language: 'zh' | 'en',
    provider: AiProviderSettings,
    scope?: ChatScopeParam,
    imageDataUrl?: string | null,
): Promise<ChatResponse> {
    const zone = scope?.zoneType === 'habit' && scope.habitId != null && scope.habitId > 0
        ? 'habit'
        : 'daily'
    const res = await apiFetch('/chat', {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            language,
            apiKey: provider.apiKey,
            baseUrl: provider.baseUrl || undefined,
            model: provider.model || undefined,
            zoneType: zone,
            habitId: zone === 'habit' ? scope?.habitId : undefined,
            imageDataUrl: imageDataUrl || undefined,
        }),
    })

    if (!res.ok) {
        let message = 'Chat request failed'
        try {
            const data = await res.json()
            message = data.message || data.title || message
        } catch {
            message = (await res.text()) || message
        }
        throw new Error(message)
    }

    const data = await res.json()
    return {
        reply: data.reply,
        actionsExecuted: data.actionsExecuted ?? data.ActionsExecuted ?? [],
        summaryUpdated: data.summaryUpdated ?? data.SummaryUpdated ?? false,
        affectionAwarded: data.affectionAwarded ?? data.AffectionAwarded,
        affectionPoints: data.affectionPoints ?? data.AffectionPoints,
        affectionTierKey: data.affectionTierKey ?? data.AffectionTierKey,
    }
}

export async function getChatHistory(scope?: ChatScopeParam): Promise<ChatHistoryResponse> {
    const res = await apiFetch(`/chat/history?${scopeQuery(scope)}`)
    if (!res.ok) throw new Error('Failed to load chat history')
    const data = await res.json()
    const messages = (data.messages ?? data.Messages ?? []) as Array<Record<string, unknown>>
    return {
        summary: data.summary ?? data.Summary ?? '',
        messages: messages.map(m => ({
            role: (m.role ?? m.Role ?? 'user') as ChatRole,
            content: String(m.content ?? m.Content ?? ''),
            createdAt: String(m.createdAt ?? m.CreatedAt ?? new Date().toISOString()),
        })),
    }
}

/** Reset conversation (messages + rolling summary) for one zone. Keeps long-term memories. */
export async function resetChatSession(scope?: ChatScopeParam): Promise<void> {
    const res = await apiFetch(`/chat/session?${scopeQuery(scope)}`, {
        method: 'DELETE',
    })
    if (!res.ok) throw new Error('Failed to reset conversation')
}

export async function listUserMemories(): Promise<UserMemoryItem[]> {
    const res = await apiFetch('/chat/memories')
    if (!res.ok) throw new Error('Failed to load memories')
    const data = await res.json()
    const list = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
    return list.map(m => ({
        id: Number(m.id ?? m.Id),
        type: String(m.type ?? m.Type ?? ''),
        key: String(m.key ?? m.Key ?? ''),
        content: String(m.content ?? m.Content ?? ''),
        importance: Number(m.importance ?? m.Importance ?? 3),
        updatedAt: String(m.updatedAt ?? m.UpdatedAt ?? ''),
    }))
}

export async function deleteUserMemory(id: number): Promise<void> {
    const res = await apiFetch(`/chat/memories/${id}`, {
        method: 'DELETE',
    })
    if (!res.ok) throw new Error('Failed to delete memory')
}

/** Clear conversation + long-term memories. Game data untouched. */
export async function resetAllCompanionMemory(): Promise<void> {
    const res = await apiFetch('/chat/memories', {
        method: 'DELETE',
    })
    if (!res.ok) throw new Error('Failed to reset memories')
}

export async function sendTodayReminder(language: 'zh' | 'en'): Promise<{ sent: boolean; message: string }> {
    const res = await apiFetch(`/chat/reminder?language=${language}`, {
        method: 'POST',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        throw new Error(data.message || 'Failed to send reminder')
    }
    return { sent: data.sent ?? data.Sent, message: data.message ?? data.Message }
}

export async function getChatPreferences(): Promise<{ dailyDigestEnabled: boolean }> {
    const res = await apiFetch('/chat/preferences')
    if (!res.ok) throw new Error('Failed to load preferences')
    const data = await res.json()
    return { dailyDigestEnabled: data.dailyDigestEnabled ?? data.DailyDigestEnabled ?? false }
}

export async function updateChatPreferences(dailyDigestEnabled: boolean): Promise<{ dailyDigestEnabled: boolean }> {
    const res = await apiFetch('/chat/preferences', {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({ dailyDigestEnabled }),
    })
    if (!res.ok) throw new Error('Failed to update preferences')
    const data = await res.json()
    return { dailyDigestEnabled: data.dailyDigestEnabled ?? data.DailyDigestEnabled ?? false }
}
