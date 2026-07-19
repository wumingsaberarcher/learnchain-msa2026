import { API_BASE } from '../config/api'

function authHeaders(json = false): HeadersInit {
    const token = localStorage.getItem('token')
    const headers: HeadersInit = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (json) headers['Content-Type'] = 'application/json'
    return headers
}

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
}

export interface AiProviderSettings {
    apiKey: string
    baseUrl: string
    model: string
}

export async function sendChat(
    messages: ChatMessagePayload[],
    language: 'zh' | 'en',
    provider: AiProviderSettings,
): Promise<ChatResponse> {
    const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            language,
            apiKey: provider.apiKey,
            baseUrl: provider.baseUrl || undefined,
            model: provider.model || undefined,
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
    }
}

export async function sendTodayReminder(language: 'zh' | 'en'): Promise<{ sent: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/chat/reminder?language=${language}`, {
        method: 'POST',
        headers: authHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
        throw new Error(data.message || 'Failed to send reminder')
    }
    return { sent: data.sent ?? data.Sent, message: data.message ?? data.Message }
}

export async function getChatPreferences(): Promise<{ dailyDigestEnabled: boolean }> {
    const res = await fetch(`${API_BASE}/chat/preferences`, { headers: authHeaders() })
    if (!res.ok) throw new Error('Failed to load preferences')
    const data = await res.json()
    return { dailyDigestEnabled: data.dailyDigestEnabled ?? data.DailyDigestEnabled ?? false }
}

export async function updateChatPreferences(dailyDigestEnabled: boolean): Promise<{ dailyDigestEnabled: boolean }> {
    const res = await fetch(`${API_BASE}/chat/preferences`, {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({ dailyDigestEnabled }),
    })
    if (!res.ok) throw new Error('Failed to update preferences')
    const data = await res.json()
    return { dailyDigestEnabled: data.dailyDigestEnabled ?? data.DailyDigestEnabled ?? false }
}
