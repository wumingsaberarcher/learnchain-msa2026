import { useCallback, useEffect, useRef } from 'react'

type SpeechRecognitionLike = {
    lang: string
    continuous: boolean
    interimResults: boolean
    start: () => void
    stop: () => void
    abort: () => void
    onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
    onerror: ((ev: { error: string }) => void) | null
    onend: (() => void) | null
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
    const w = window as Window & {
        SpeechRecognition?: new () => SpeechRecognitionLike
        webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useSpeechInput(options: {
    language: 'zh' | 'en'
    onResult: (transcript: string) => void
    onListeningChange: (listening: boolean) => void
    onError?: (message: string) => void
}) {
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
    const supported = typeof window !== 'undefined' && !!getSpeechRecognitionCtor()

    useEffect(() => {
        return () => {
            recognitionRef.current?.abort()
            recognitionRef.current = null
        }
    }, [])

    const stop = useCallback(() => {
        recognitionRef.current?.stop()
        options.onListeningChange(false)
    }, [options])

    const start = useCallback(() => {
        const Ctor = getSpeechRecognitionCtor()
        if (!Ctor) {
            options.onError?.('unsupported')
            return
        }

        recognitionRef.current?.abort()
        const recognition = new Ctor()
        recognition.lang = options.language === 'zh' ? 'zh-CN' : 'en-US'
        recognition.continuous = false
        recognition.interimResults = false

        recognition.onresult = (ev) => {
            const result = ev.results[0]
            if (result) {
                options.onResult(result[0].transcript)
            }
        }
        recognition.onerror = (ev) => {
            options.onListeningChange(false)
            if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
                options.onError?.(ev.error)
            }
        }
        recognition.onend = () => {
            options.onListeningChange(false)
        }

        recognitionRef.current = recognition
        options.onListeningChange(true)
        try {
            recognition.start()
        } catch {
            options.onListeningChange(false)
            options.onError?.('start_failed')
        }
    }, [options])

    const toggle = useCallback(() => {
        if (recognitionRef.current) {
            stop()
        } else {
            start()
        }
    }, [start, stop])

    return { supported, start, stop, toggle }
}
