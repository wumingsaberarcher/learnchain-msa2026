import { create } from 'zustand'
import {
    sendChat,
    type ChatActionResult,
    type ChatMessagePayload,
} from '../api/chatApi'
import { useAiSettingsStore } from './aiSettingsStore'

export interface UiChatMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt: number
}

interface ChatState {
    isOpen: boolean
    messages: UiChatMessage[]
    isSending: boolean
    isListening: boolean
    error: string | null
    lastActions: ChatActionResult[]
    userId: number | null
    toggle: () => void
    open: () => void
    close: () => void
    setListening: (v: boolean) => void
    clearError: () => void
    clearHistory: () => void
    hydrateForUser: (userId: number | null) => void
    sendMessage: (text: string, language: 'zh' | 'en') => Promise<ChatActionResult[]>
}

const historyKey = (userId: number) => `learnchain-chat-${userId}`

function loadMessages(userId: number | null): UiChatMessage[] {
    if (!userId) return []
    try {
        const raw = localStorage.getItem(historyKey(userId))
        if (!raw) return []
        const parsed = JSON.parse(raw) as UiChatMessage[]
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function saveMessages(userId: number | null, messages: UiChatMessage[]) {
    if (!userId) return
    localStorage.setItem(historyKey(userId), JSON.stringify(messages.slice(-80)))
}

function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useChatStore = create<ChatState>((set, get) => ({
    isOpen: false,
    messages: [],
    isSending: false,
    isListening: false,
    error: null,
    lastActions: [],
    userId: null,

    toggle: () => set(s => ({ isOpen: !s.isOpen, error: null })),
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false, isListening: false }),
    setListening: (v) => set({ isListening: v }),
    clearError: () => set({ error: null }),

    clearHistory: () => {
        const { userId } = get()
        set({ messages: [], lastActions: [] })
        if (userId) localStorage.removeItem(historyKey(userId))
    },

    hydrateForUser: (userId) => {
        set({
            userId,
            messages: loadMessages(userId),
            error: null,
            lastActions: [],
            isOpen: false,
            isListening: false,
        })
    },

    sendMessage: async (text, language) => {
        const trimmed = text.trim()
        if (!trimmed) return []

        const provider = useAiSettingsStore.getState()
        if (!provider.apiKey.trim()) {
            set({ error: 'missing_api_key' })
            return []
        }

        const userMsg: UiChatMessage = {
            id: uid(),
            role: 'user',
            content: trimmed,
            createdAt: Date.now(),
        }

        const nextMessages = [...get().messages, userMsg]
        set({ messages: nextMessages, isSending: true, error: null, lastActions: [] })
        saveMessages(get().userId, nextMessages)

        const payload: ChatMessagePayload[] = nextMessages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: m.content }))

        try {
            const res = await sendChat(payload, language, {
                apiKey: provider.apiKey,
                baseUrl: provider.baseUrl,
                model: provider.model,
            })

            const assistantMsg: UiChatMessage = {
                id: uid(),
                role: 'assistant',
                content: res.reply,
                createdAt: Date.now(),
            }
            const withAssistant = [...get().messages, assistantMsg]
            set({
                messages: withAssistant,
                isSending: false,
                lastActions: res.actionsExecuted,
            })
            saveMessages(get().userId, withAssistant)
            return res.actionsExecuted
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Chat failed'
            set({ isSending: false, error: message })
            return []
        }
    },
}))
