import { useCallback, useEffect, useRef, useState } from 'react'

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
 * Prefer zh-CN so Chinese emits characters (not pinyin).
 * Chrome's Chinese model still accepts mixed EN/中 sentences.
 */
function resolveSpeechLang(_uiLanguage: 'zh' | 'en'): string {
    return 'zh-CN'
}

/** Soften silence / distant speech so recognition stays open longer. */
const RESTART_ERRORS = new Set(['no-speech', 'aborted'])

export function useSpeechInput(options: {
    language: 'zh' | 'en'
    onResult: (transcript: string) => void
    onListeningChange: (listening: boolean) => void
    onError?: (message: string) => void
}) {
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
    const wantListenRef = useRef(false)
    const startingRef = useRef(false)
    const restartTimerRef = useRef<number | null>(null)
    const optionsRef = useRef(options)
    optionsRef.current = options

    const volumeStreamRef = useRef<MediaStream | null>(null)
    const audioCtxRef = useRef<AudioContext | null>(null)
    const analyserRef = useRef<AnalyserNode | null>(null)
    const rafRef = useRef<number | null>(null)

    const [volumeLevel, setVolumeLevel] = useState(0)

    const supported = typeof window !== 'undefined' && !!getSpeechRecognitionCtor()

    const setListening = useCallback((value: boolean) => {
        optionsRef.current.onListeningChange(value)
    }, [])

    const stopVolumeMeter = useCallback(() => {
        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
        analyserRef.current = null
        if (audioCtxRef.current) {
            void audioCtxRef.current.close().catch(() => undefined)
            audioCtxRef.current = null
        }
        if (volumeStreamRef.current) {
            for (const track of volumeStreamRef.current.getTracks()) track.stop()
            volumeStreamRef.current = null
        }
        setVolumeLevel(0)
    }, [])

    const tickVolume = useCallback(() => {
        const analyser = analyserRef.current
        if (!analyser) return
        const data = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
            const v = (data[i]! - 128) / 128
            sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        // Boost quieter distant speech for the UI meter
        const boosted = Math.min(1, Math.pow(rms * 3.2, 0.65))
        setVolumeLevel(boosted)
        rafRef.current = requestAnimationFrame(tickVolume)
    }, [])

    const startVolumeMeter = useCallback(async () => {
        if (!navigator.mediaDevices?.getUserMedia) return
        try {
            stopVolumeMeter()
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            })
            volumeStreamRef.current = stream
            const ctx = new AudioContext()
            audioCtxRef.current = ctx
            if (ctx.state === 'suspended') await ctx.resume()
            const source = ctx.createMediaStreamSource(stream)
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 512
            analyser.smoothingTimeConstant = 0.35
            source.connect(analyser)
            analyserRef.current = analyser
            rafRef.current = requestAnimationFrame(tickVolume)
        } catch {
            /* meter is optional; recognition may still work */
        }
    }, [stopVolumeMeter, tickVolume])

    const clearRestartTimer = useCallback(() => {
        if (restartTimerRef.current != null) {
            window.clearTimeout(restartTimerRef.current)
            restartTimerRef.current = null
        }
    }, [])

    const cleanupRecognition = useCallback(() => {
        clearRestartTimer()
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
    }, [clearRestartTimer])

    const beginRecognition = useCallback(() => {
        const Ctor = getSpeechRecognitionCtor()
        if (!Ctor || !wantListenRef.current) return
        if (startingRef.current) return

        clearRestartTimer()
        cleanupRecognition()
        startingRef.current = true

        const recognition = new Ctor()
        recognition.lang = resolveSpeechLang(optionsRef.current.language)
        recognition.continuous = true
        recognition.interimResults = true
        recognition.maxAlternatives = 1

        recognition.onresult = (ev) => {
            let finalChunk = ''
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                const row = ev.results[i]
                if (!row) continue
                const text = row[0]?.transcript?.trim()
                if (!text) continue
                if (row.isFinal) finalChunk += (finalChunk ? ' ' : '') + text
            }
            if (finalChunk) {
                optionsRef.current.onResult(finalChunk)
            }
        }

        recognition.onerror = (ev) => {
            startingRef.current = false
            // Stay open on silence / abort while user still wants listening
            if (wantListenRef.current && RESTART_ERRORS.has(ev.error)) {
                recognitionRef.current = null
                clearRestartTimer()
                restartTimerRef.current = window.setTimeout(() => {
                    if (wantListenRef.current) beginRecognition()
                }, 180)
                return
            }
            if (ev.error === 'aborted') return
            wantListenRef.current = false
            recognitionRef.current = null
            setListening(false)
            stopVolumeMeter()
            optionsRef.current.onError?.(ev.error)
        }

        recognition.onend = () => {
            startingRef.current = false
            recognitionRef.current = null
            // Chrome ends continuous sessions periodically — restart until user stops
            if (wantListenRef.current) {
                clearRestartTimer()
                restartTimerRef.current = window.setTimeout(() => {
                    if (wantListenRef.current) beginRecognition()
                }, 120)
                return
            }
            setListening(false)
            stopVolumeMeter()
        }

        recognitionRef.current = recognition

        window.setTimeout(() => {
            if (!wantListenRef.current || recognitionRef.current !== recognition) {
                startingRef.current = false
                return
            }
            try {
                recognition.start()
                startingRef.current = false
                setListening(true)
            } catch {
                startingRef.current = false
                recognitionRef.current = null
                if (wantListenRef.current) {
                    clearRestartTimer()
                    restartTimerRef.current = window.setTimeout(() => {
                        if (wantListenRef.current) beginRecognition()
                    }, 280)
                } else {
                    setListening(false)
                    stopVolumeMeter()
                    optionsRef.current.onError?.('start_failed')
                }
            }
        }, 40)
    }, [cleanupRecognition, clearRestartTimer, setListening, stopVolumeMeter])

    useEffect(() => {
        return () => {
            wantListenRef.current = false
            cleanupRecognition()
            stopVolumeMeter()
        }
    }, [cleanupRecognition, stopVolumeMeter])

    const stop = useCallback(() => {
        wantListenRef.current = false
        clearRestartTimer()
        const rec = recognitionRef.current
        setListening(false)
        stopVolumeMeter()
        if (!rec) {
            cleanupRecognition()
            return
        }
        try {
            rec.stop()
        } catch {
            cleanupRecognition()
        }
        recognitionRef.current = null
    }, [cleanupRecognition, clearRestartTimer, setListening, stopVolumeMeter])

    const start = useCallback(() => {
        if (!getSpeechRecognitionCtor()) {
            optionsRef.current.onError?.('unsupported')
            return
        }
        if (wantListenRef.current) return
        wantListenRef.current = true
        setListening(true)
        void startVolumeMeter()
        beginRecognition()
    }, [beginRecognition, setListening, startVolumeMeter])

    const toggle = useCallback(() => {
        if (wantListenRef.current) {
            stop()
            return
        }
        start()
    }, [start, stop])

    return { supported, start, stop, toggle, volumeLevel }
}
