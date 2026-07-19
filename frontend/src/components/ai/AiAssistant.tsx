import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, Mail, Mic, MicOff, Send, Trash2, X } from 'lucide-react'
import { sendTodayReminder } from '../../api/chatApi'
import { useChatStore } from '../../stores/chatStore'
import { useAiSettingsStore } from '../../stores/aiSettingsStore'
import { useHabitStore } from '../../stores/habitStore'
import { useTranslation } from '../../stores/settingsStore'
import { useSpeechInput } from './useSpeechInput'

export default function AiAssistant() {
    const { isLoggedIn, currentUser, fetchHabits, fetchTodayCheckedHabits } = useHabitStore()
    const { t, language, theme } = useTranslation()
    const {
        isOpen, messages, isSending, isListening, error, lastActions,
        toggle, close, setListening, clearHistory, hydrateForUser, sendMessage, clearError,
    } = useChatStore()
    const apiKey = useAiSettingsStore(s => s.apiKey)

    const [draft, setDraft] = useState('')
    const [reminderMsg, setReminderMsg] = useState('')
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        hydrateForUser(isLoggedIn && currentUser ? currentUser.id : null)
    }, [isLoggedIn, currentUser?.id, hydrateForUser])

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight
        }
    }, [messages, isSending, isOpen])

    useEffect(() => {
        if (lastActions.length === 0) return
        const needsRefresh = lastActions.some(a =>
            a.type === 'habit_created' || a.type === 'habit_updated' || a.type === 'habit_deleted')
        if (needsRefresh) {
            void fetchHabits()
            void fetchTodayCheckedHabits()
        }
    }, [lastActions, fetchHabits, fetchTodayCheckedHabits])

    const speech = useSpeechInput({
        language,
        onResult: (transcript) => {
            setDraft(prev => (prev ? `${prev} ${transcript}` : transcript).trim())
        },
        onListeningChange: setListening,
        onError: () => setListening(false),
    })

    if (!isLoggedIn) return null

    const handleSend = async () => {
        if (!draft.trim() || isSending) return
        const text = draft
        setDraft('')
        await sendMessage(text, language)
    }

    const handleReminder = async () => {
        setReminderMsg('')
        try {
            const res = await sendTodayReminder(language)
            setReminderMsg(res.message || t('chat.reminderSent'))
        } catch (err) {
            setReminderMsg(err instanceof Error ? err.message : t('chat.reminderFailed'))
        }
        setTimeout(() => setReminderMsg(''), 4000)
    }

    const errorText = error === 'missing_api_key' ? t('chat.missingApiKey') : error

    return (
        <div className={`ai-assistant theme-${theme}`}>
            {isOpen && (
                <div className="ai-chat-panel" role="dialog" aria-label={t('chat.title')}>
                    <div className="ai-chat-header">
                        <div className="ai-chat-header-title">
                            <Bot className="w-5 h-5" />
                            <div>
                                <strong>{t('chat.title')}</strong>
                                <p>{t('chat.subtitle')}</p>
                            </div>
                        </div>
                        <div className="ai-chat-header-actions">
                            <button type="button" className="ai-icon-btn" title={t('chat.clear')} onClick={clearHistory}>
                                <Trash2 className="w-4 h-4" />
                            </button>
                            <button type="button" className="ai-icon-btn" title={t('chat.close')} onClick={close}>
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {!apiKey.trim() && (
                        <div className="ai-chat-banner">
                            {t('chat.needApiKey')}{' '}
                            <Link to="/profile" onClick={close}>{t('chat.goProfile')}</Link>
                        </div>
                    )}

                    <div className="ai-chat-messages" ref={listRef}>
                        {messages.length === 0 && (
                            <div className="ai-chat-empty">
                                <p>{t('chat.welcome')}</p>
                                <ul>
                                    <li>{t('chat.hintToday')}</li>
                                    <li>{t('chat.hintCreate')}</li>
                                    <li>{t('chat.hintRemind')}</li>
                                </ul>
                            </div>
                        )}
                        {messages.map(m => (
                            <div key={m.id} className={`ai-bubble ai-bubble-${m.role}`}>
                                {m.content}
                            </div>
                        ))}
                        {isSending && <div className="ai-bubble ai-bubble-assistant ai-typing">{t('chat.thinking')}</div>}
                        {lastActions.map((a, i) => (
                            <div key={`${a.type}-${i}`} className="ai-action-chip">{a.summary}</div>
                        ))}
                    </div>

                    {errorText && (
                        <div className="ai-chat-error" onClick={clearError}>{errorText}</div>
                    )}
                    {reminderMsg && <div className="ai-chat-info">{reminderMsg}</div>}

                    <div className="ai-chat-input-row">
                        <button
                            type="button"
                            className="ai-icon-btn"
                            title={t('chat.sendReminder')}
                            onClick={handleReminder}
                            disabled={isSending}
                        >
                            <Mail className="w-4 h-4" />
                        </button>
                        <textarea
                            className="ai-chat-input"
                            rows={1}
                            value={draft}
                            placeholder={t('chat.placeholder')}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    void handleSend()
                                }
                            }}
                        />
                        <button
                            type="button"
                            className={`ai-icon-btn ${isListening ? 'listening' : ''}`}
                            title={speech.supported ? t('chat.voice') : t('chat.voiceUnsupported')}
                            disabled={!speech.supported || isSending}
                            onClick={() => speech.toggle()}
                        >
                            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </button>
                        <button
                            type="button"
                            className="ai-send-btn"
                            onClick={() => void handleSend()}
                            disabled={isSending || !draft.trim()}
                            title={t('chat.send')}
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            <button
                type="button"
                className={`ai-fab ${isOpen ? 'open' : ''}`}
                onClick={toggle}
                aria-label={t('chat.title')}
            >
                {isOpen ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
            </button>
        </div>
    )
}
