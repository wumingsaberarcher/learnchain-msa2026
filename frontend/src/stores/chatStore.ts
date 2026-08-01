import { create } from 'zustand'
import {
    getChatHistory,
    resetChatSession,
    sendChat,
    type ChatActionResult,
    type ChatMessagePayload,
} from '../api/chatApi'
import { useAiSettingsStore } from './aiSettingsStore'
import { useCompanionStore } from './companionStore'
import type { Emotion } from '../components/character/emotionAssets'
import type { CompanionScene } from '../companions/companionLines'

export interface UiChatMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    createdAt: number
    /** Local-only aside lines from idle/focus peek (not sent to LLM). */
    kind?: 'chat' | 'aside'
    scene?: CompanionScene
    emotion?: Emotion
}

interface ChatState {
    isOpen: boolean
    messages: UiChatMessage[]
    isSending: boolean
    isListening: boolean
    isHydrating: boolean
    error: string | null
    lastActions: ChatActionResult[]
    userId: number | null
    toggle: () => void
    open: () => void
    close: () => void
    setListening: (v: boolean) => void
    clearError: () => void
    clearHistory: () => Promise<void>
    hydrateForUser: (userId: number | null) => void
    sendMessage: (text: string, language: 'zh' | 'en') => Promise<ChatActionResult[]>
    appendCompanionAside: (content: string, scene: 'idle' | 'focus', emotion?: Emotion) => void
}

const historyKey = (userId: number) => `learnchain-chat-${userId}`

function loadLocalMessages(userId: number | null): UiChatMessage[] {
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

function saveLocalMessages(userId: number | null, messages: UiChatMessage[]) {
    if (!userId) return
    localStorage.setItem(historyKey(userId), JSON.stringify(messages.slice(-100)))
}

function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useChatStore = create<ChatState>((set, get) => ({
    isOpen: false,
    messages: [],
    isSending: false,
    isListening: false,
    isHydrating: false,
    error: null,
    lastActions: [],
    userId: null,

    toggle: () => set(s => ({ isOpen: !s.isOpen, error: null })),
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false, isListening: false }),
    setListening: (v) => set({ isListening: v }),
    clearError: () => set({ error: null }),

    clearHistory: async () => {
        const { userId } = get()
        set({ messages: [], lastActions: [], error: null })
        if (userId) localStorage.removeItem(historyKey(userId))
        try {
            await resetChatSession()
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to reset conversation'
            set({ error: message })
        }
    },

    hydrateForUser: (userId) => {
        set({
            userId,
            messages: loadLocalMessages(userId),
            error: null,
            lastActions: [],
            isOpen: false,
            isListening: false,
            isHydrating: !!userId,
        })

        if (!userId) return

        void getChatHistory()
            .then(history => {
                if (get().userId !== userId) return
                const local = get().messages
                const asides = local.filter(m => m.kind === 'aside')
                const mapped: UiChatMessage[] = history.messages
                    .filter(m => m.role === 'user' || m.role === 'assistant')
                    .map((m, i) => ({
                        id: `srv-${userId}-${i}-${m.createdAt}`,
                        role: m.role as 'user' | 'assistant',
                        content: m.content,
                        createdAt: Date.parse(m.createdAt) || Date.now(),
                        kind: 'chat' as const,
                    }))
                const messages = mapped.length > 0
                    ? [...mapped, ...asides].sort((a, b) => a.createdAt - b.createdAt).slice(-100)
                    : local
                set({ messages, isHydrating: false })
                saveLocalMessages(userId, messages)
            })
            .catch(() => {
                if (get().userId === userId) set({ isHydrating: false })
            })
    },

    appendCompanionAside: (content, scene, emotion) => {
        const trimmed = content.trim()
        if (!trimmed) return
        const msg: UiChatMessage = {
            id: uid(),
            role: 'assistant',
            content: trimmed,
            createdAt: Date.now(),
            kind: 'aside',
            scene,
            emotion,
        }
        const messages = [...get().messages, msg]
        set({ messages })
        saveLocalMessages(get().userId, messages)
        if (emotion) useCompanionStore.getState().setEmotion(emotion, true)
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
            kind: 'chat',
        }

        const nextMessages = [...get().messages, userMsg]
        set({ messages: nextMessages, isSending: true, error: null, lastActions: [] })
        saveLocalMessages(get().userId, nextMessages)
        useCompanionStore.getState().setEmotion('normal', true)

        const payload: ChatMessagePayload[] = [{ role: 'user', content: trimmed }]

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
                kind: 'chat',
            }
            const withAssistant = [...get().messages, assistantMsg]
            set({
                messages: withAssistant,
                isSending: false,
                lastActions: res.actionsExecuted,
            })
            saveLocalMessages(get().userId, withAssistant)
            useCompanionStore.getState().reactToText(res.reply, true)
            window.setTimeout(() => {
                useCompanionStore.getState().setEmotion(
                    useCompanionStore.getState().emotion,
                    false,
                )
            }, 2200)
            return res.actionsExecuted
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Chat failed'
            set({ isSending: false, error: message })
            useCompanionStore.getState().setEmotion('sorrow', false)
            return []
        }
    },
}))
