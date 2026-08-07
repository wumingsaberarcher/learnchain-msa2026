import { create } from 'zustand'
import {
    getChatHistory,
    resetChatSession,
    sendChat,
    type ChatActionResult,
    type ChatMessagePayload,
    type ChatZoneType,
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
    kind?: 'chat' | 'aside' | 'chatter'
    scene?: CompanionScene
    emotion?: Emotion
}

export interface ChatScope {
    zoneType: ChatZoneType
    habitId: number | null
}

export const DAILY_SCOPE: ChatScope = { zoneType: 'daily', habitId: null }

export function scopesEqual(a: ChatScope, b: ChatScope) {
    return a.zoneType === b.zoneType && (a.habitId ?? 0) === (b.habitId ?? 0)
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
    scope: ChatScope
    toggle: () => void
    open: () => void
    close: () => void
    setListening: (v: boolean) => void
    clearError: () => void
    clearHistory: () => Promise<void>
    hydrateForUser: (userId: number | null) => void
    /** Switch daily ↔ habit learning zone (isolates transcript + server memory). */
    setScope: (scope: ChatScope) => Promise<void>
    sendMessage: (text: string, language: 'zh' | 'en') => Promise<ChatActionResult[]>
    appendCompanionAside: (content: string, scene: 'idle' | 'focus', emotion?: Emotion) => void
    appendLocalExchange: (userContent: string, assistantContent: string) => void
}

export function historyKey(userId: number, scope: ChatScope) {
    if (scope.zoneType === 'habit' && scope.habitId != null && scope.habitId > 0) {
        return `learnchain-chat-${userId}-habit-${scope.habitId}`
    }
    return `learnchain-chat-${userId}-daily`
}

/** Migrate legacy unscoped key into daily once. */
function migrateLegacyKey(userId: number) {
    const legacy = `learnchain-chat-${userId}`
    const daily = historyKey(userId, DAILY_SCOPE)
    try {
        if (!localStorage.getItem(daily) && localStorage.getItem(legacy)) {
            localStorage.setItem(daily, localStorage.getItem(legacy)!)
        }
    } catch {
        /* ignore */
    }
}

function loadLocalMessages(userId: number | null, scope: ChatScope): UiChatMessage[] {
    if (!userId) return []
    migrateLegacyKey(userId)
    try {
        const raw = localStorage.getItem(historyKey(userId, scope))
        if (!raw) return []
        const parsed = JSON.parse(raw) as UiChatMessage[]
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function saveLocalMessages(userId: number | null, scope: ChatScope, messages: UiChatMessage[]) {
    if (!userId) return
    localStorage.setItem(historyKey(userId, scope), JSON.stringify(messages.slice(-100)))
}

function messageKindForScope(scope: ChatScope): 'chat' | 'chatter' {
    return scope.zoneType === 'habit' && scope.habitId != null && scope.habitId > 0
        ? 'chat'
        : 'chatter'
}

function uid() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function hydrateScope(userId: number, scope: ChatScope) {
    const local = loadLocalMessages(userId, scope)
    const msgKind = messageKindForScope(scope)
    try {
        const history = await getChatHistory(scope)
        const asides = local.filter(m => m.kind === 'aside')
        // Daily chatter is not formal conversation history — keep live continuity locally,
        // but do not promote server rows into "对话记录" (kind: chat).
        if (msgKind === 'chatter') {
            const localChatty = local.filter(m => m.kind !== 'aside')
            const messages = [...localChatty, ...asides]
                .sort((a, b) => a.createdAt - b.createdAt)
                .slice(-100)
            saveLocalMessages(userId, scope, messages)
            return messages
        }
        const mapped: UiChatMessage[] = history.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map((m, i) => ({
                id: `srv-${userId}-${scope.zoneType}-${scope.habitId ?? 0}-${i}-${m.createdAt}`,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                createdAt: Date.parse(m.createdAt) || Date.now(),
                kind: 'chat' as const,
            }))
        const messages = mapped.length > 0
            ? [...mapped, ...asides].sort((a, b) => a.createdAt - b.createdAt).slice(-100)
            : local
        saveLocalMessages(userId, scope, messages)
        return messages
    } catch {
        return local
    }
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
    scope: DAILY_SCOPE,

    toggle: () => set(s => ({ isOpen: !s.isOpen, error: null })),
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false, isListening: false }),
    setListening: (v) => set({ isListening: v }),
    clearError: () => set({ error: null }),

    clearHistory: async () => {
        const { userId, scope } = get()
        set({ messages: [], lastActions: [], error: null })
        if (userId) localStorage.removeItem(historyKey(userId, scope))
        try {
            await resetChatSession(scope)
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to reset conversation'
            set({ error: message })
        }
    },

    hydrateForUser: (userId) => {
        const scope = DAILY_SCOPE
        set({
            userId,
            scope,
            messages: loadLocalMessages(userId, scope),
            error: null,
            lastActions: [],
            isOpen: false,
            isListening: false,
            isHydrating: !!userId,
        })

        if (!userId) return

        void hydrateScope(userId, scope).then(messages => {
            if (get().userId !== userId || !scopesEqual(get().scope, scope)) return
            set({ messages, isHydrating: false })
        })
    },

    setScope: async (next) => {
        const { userId, scope, messages } = get()
        const normalized: ChatScope =
            next.zoneType === 'habit' && next.habitId != null && next.habitId > 0
                ? { zoneType: 'habit', habitId: next.habitId }
                : DAILY_SCOPE

        if (scopesEqual(scope, normalized)) {
            // Still refresh from server when re-entering same zone
            if (userId) {
                set({ isHydrating: true })
                const msgs = await hydrateScope(userId, normalized)
                if (get().userId === userId && scopesEqual(get().scope, normalized)) {
                    set({ messages: msgs, isHydrating: false })
                }
            }
            return
        }

        if (userId) saveLocalMessages(userId, scope, messages)

        set({
            scope: normalized,
            messages: userId ? loadLocalMessages(userId, normalized) : [],
            lastActions: [],
            error: null,
            isHydrating: !!userId,
        })

        if (!userId) return
        const msgs = await hydrateScope(userId, normalized)
        if (get().userId === userId && scopesEqual(get().scope, normalized)) {
            set({ messages: msgs, isHydrating: false })
        }
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
        const { userId, scope } = get()
        const next = [...get().messages, msg]
        set({ messages: next })
        saveLocalMessages(userId, scope, next)
        if (emotion) useCompanionStore.getState().setEmotion(emotion, true)
    },

    appendLocalExchange: (userContent, assistantContent) => {
        const { userId, scope } = get()
        const now = Date.now()
        const next = [
            ...get().messages,
            {
                id: uid(),
                role: 'user' as const,
                content: userContent,
                createdAt: now,
                kind: 'chat' as const,
            },
            {
                id: uid(),
                role: 'assistant' as const,
                content: assistantContent,
                createdAt: now + 1,
                kind: 'chat' as const,
            },
        ].slice(-100)
        set({ messages: next })
        saveLocalMessages(userId, scope, next)
    },

    sendMessage: async (text, language) => {
        const trimmed = text.trim()
        if (!trimmed) return []

        const provider = useAiSettingsStore.getState()
        if (!provider.apiKey.trim()) {
            set({ error: 'missing_api_key' })
            return []
        }

        const { userId, scope } = get()
        const kind = messageKindForScope(scope)
        const userMsg: UiChatMessage = {
            id: uid(),
            role: 'user',
            content: trimmed,
            createdAt: Date.now(),
            kind,
        }

        const nextMessages = [...get().messages, userMsg]
        set({ messages: nextMessages, isSending: true, error: null, lastActions: [] })
        saveLocalMessages(userId, scope, nextMessages)
        if (!useCompanionStore.getState().galModeOpen) {
            useCompanionStore.getState().setEmotion('normal', true)
        }

        const payload: ChatMessagePayload[] = [{ role: 'user', content: trimmed }]

        try {
            const res = await sendChat(payload, language, {
                apiKey: provider.apiKey,
                baseUrl: provider.baseUrl,
                model: provider.model,
            }, scope)

            const assistantMsg: UiChatMessage = {
                id: uid(),
                role: 'assistant',
                content: res.reply,
                createdAt: Date.now(),
                kind,
            }
            const withAssistant = [...get().messages, assistantMsg]
            set({
                messages: withAssistant,
                isSending: false,
                lastActions: res.actionsExecuted,
            })
            saveLocalMessages(userId, scope, withAssistant)
            if (res.affectionPoints != null) {
                const { useAffectionStore } = await import('./affectionStore')
                useAffectionStore.getState().applyAward({
                    awarded: res.affectionAwarded,
                    points: res.affectionPoints,
                    tierKey: res.affectionTierKey,
                })
            }
            if (!useCompanionStore.getState().galModeOpen) {
                useCompanionStore.getState().reactToText(res.reply, true)
                window.setTimeout(() => {
                    useCompanionStore.getState().setEmotion(
                        useCompanionStore.getState().emotion,
                        false,
                    )
                }, 2200)
            }
            return res.actionsExecuted
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Chat failed'
            set({ isSending: false, error: message })
            if (!useCompanionStore.getState().galModeOpen) {
                useCompanionStore.getState().setEmotion('sorrow', false)
            }
            return []
        }
    },
}))
