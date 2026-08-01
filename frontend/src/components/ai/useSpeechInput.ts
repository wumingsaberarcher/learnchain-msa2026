import { useCallback, useEffect, useRef } from 'react'

type SpeechRecognitionResultLike = {
    0: { transcript: string }
    isFinal: boolean
    length: number
}

type SpeechRecognitionEventLike = {
    resultIndex: number
    results: ArrayLike<SpeechRecognitionResultLike> & { length: number }
}

type SpeechRecognitionLike = {
    lang: string
    continuous: boolean
    interimResults: boolean
    maxAlternatives: number
    start: () => void
    stop: () => void
    abort: () => void
    onresult: ((ev: SpeechRecognitionEventLike) => void) | null
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

/**
 * Pick Web Speech locale.
 * Always prefer zh-CN for this bilingual app: it emits Chinese characters (not pinyin)
 * and Chrome's Chinese model still accepts English words / mixed 中英 sentences.
 * Using en-US while speaking Chinese is what produces pinyin-like romanization.
 */
function resolveSpeechLang(_uiLanguage: 'zh' | 'en'): string {
    return 'zh-CN'
}

export function useSpeechInput(options: {
    language: 'zh' | 'en'
    onResult: (transcript: string) => void
    onListeningChange: (listening: boolean) => void
    onError?: (message: string) => void
}) {
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
    const listeningRef = useRef(false)
    const startingRef = useRef(false)
    const optionsRef = useRef(options)
    optionsRef.current = options

    const supported = typeof window !== 'undefined' && !!getSpeechRecognitionCtor()

    const setListening = useCallback((value: boolean) => {
        listeningRef.current = value
        optionsRef.current.onListeningChange(value)
    }, [])

    const cleanupRecognition = useCallback(() => {
        const rec = recognitionRef.current
        recognitionRef.current = null
        startingRef.current = false
        if (!rec) return
        rec.onresult = null
        rec.onerror = null
        rec.onend = null
        try {
            rec.abort()
        } catch {
            try {
                rec.stop()
            } catch {
                /* ignore */
            }
        }
    }, [])

    useEffect(() => {
        return () => {
            cleanupRecognition()
            listeningRef.current = false
        }
    }, [cleanupRecognition])

    const stop = useCallback(() => {
        const rec = recognitionRef.current
        setListening(false)
        if (!rec) return
        try {
            rec.stop()
        } catch {
            cleanupRecognition()
        }
    }, [cleanupRecognition, setListening])

    const start = useCallback(() => {
        const Ctor = getSpeechRecognitionCtor()
        if (!Ctor) {
            optionsRef.current.onError?.('unsupported')
            return
        }
        if (startingRef.current || listeningRef.current) return

        // Tear down any leftover instance so Chrome allows a fresh start()
        cleanupRecognition()
        startingRef.current = true

        const recognition = new Ctor()
        recognition.lang = resolveSpeechLang(optionsRef.current.language)
        recognition.continuous = false
        recognition.interimResults = true
        recognition.maxAlternatives = 1

        recognition.onresult = (ev) => {
            let finalChunk = ''
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                const row = ev.results[i]
                if (!row) continue
                const text = row[0]?.transcript?.trim()
                if (!text) continue
                if (row.isFinal) finalChunk += text
            }
            if (finalChunk) {
                optionsRef.current.onResult(finalChunk)
            }
        }

        recognition.onerror = (ev) => {
            startingRef.current = false
            setListening(false)
            recognitionRef.current = null
            if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
                optionsRef.current.onError?.(ev.error)
            }
        }

        recognition.onend = () => {
            startingRef.current = false
            recognitionRef.current = null
            setListening(false)
        }

        recognitionRef.current = recognition
        setListening(true)

        // Chrome can throw if start() follows abort() too quickly
        window.setTimeout(() => {
            if (recognitionRef.current !== recognition) return
            try {
                recognition.start()
                startingRef.current = false
            } catch {
                startingRef.current = false
                recognitionRef.current = null
                setListening(false)
                optionsRef.current.onError?.('start_failed')
            }
        }, 40)
    }, [cleanupRecognition, setListening])

    const toggle = useCallback(() => {
        if (listeningRef.current || startingRef.current) {
            stop()
            cleanupRecognition()
            setListening(false)
            return
        }
        start()
    }, [cleanupRecognition, setListening, start, stop])

    return { supported, start, stop, toggle }
}
