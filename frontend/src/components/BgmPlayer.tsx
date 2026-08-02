import { useCallback, useEffect, useRef, useState } from 'react'
import { BADGE_DEFINITIONS } from '../badges/badgeDefinitions'
import { useAchievementStore } from '../stores/achievementStore'
import {
    BGM_TRACKS,
    bgmTrackUrl,
    hasAllBadgesUnlocked,
    useBgmStore,
} from '../stores/bgmStore'

/**
 * Invisible audio engine: loops current BGM at low volume.
 * Starts after first user gesture (browser autoplay policy).
 */
export default function BgmPlayer() {
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const [resolvedSrc, setResolvedSrc] = useState<string | null>(null)
    const retryRef = useRef(0)
    const mutedRef = useRef(false)
    const volumeRef = useRef(0.28)

    const trackId = useBgmStore(s => s.trackId)
    const volume = useBgmStore(s => s.volume)
    const muted = useBgmStore(s => s.muted)
    const libraryReady = useBgmStore(s => s.libraryReady)
    const setPlaying = useBgmStore(s => s.setPlaying)
    const setNeedsGesture = useBgmStore(s => s.setNeedsGesture)
    const unlockAllBadgeTracks = useBgmStore(s => s.unlockAllBadgeTracks)
    const selectTrack = useBgmStore(s => s.selectTrack)
    const hydrateUserLibrary = useBgmStore(s => s.hydrateUserLibrary)
    const resolveTrackSrc = useBgmStore(s => s.resolveTrackSrc)

    const achievements = useAchievementStore(s => s.achievements)

    mutedRef.current = muted
    volumeRef.current = volume

    const tryPlay = useCallback((audio: HTMLAudioElement) => {
        audio.muted = mutedRef.current
        audio.volume = mutedRef.current ? 0 : volumeRef.current
        return audio.play()
            .then(() => {
                setNeedsGesture(false)
                setPlaying(true)
            })
            .catch((err: unknown) => {
                const name = err instanceof Error ? err.name : ''
                if (name === 'AbortError') return
                setNeedsGesture(true)
                setPlaying(false)
            })
    }, [setNeedsGesture, setPlaying])

    useEffect(() => {
        void hydrateUserLibrary()
    }, [hydrateUserLibrary])

    useEffect(() => {
        const audio = new Audio()
        audio.loop = true
        audio.preload = 'auto'
        audioRef.current = audio

        const onPlay = () => setPlaying(true)
        const onPause = () => setPlaying(false)
        const onError = () => {
            setPlaying(false)
            setNeedsGesture(true)
            if (retryRef.current < 1 && audio.getAttribute('data-src')) {
                retryRef.current += 1
                const src = audio.getAttribute('data-src')!
                window.setTimeout(() => {
                    if (audioRef.current !== audio) return
                    audio.src = src
                    audio.load()
                    void tryPlay(audio)
                }, 800)
            }
        }
        audio.addEventListener('play', onPlay)
        audio.addEventListener('pause', onPause)
        audio.addEventListener('error', onError)

        return () => {
            audio.removeEventListener('play', onPlay)
            audio.removeEventListener('pause', onPause)
            audio.removeEventListener('error', onError)
            audio.pause()
            audio.src = ''
            audioRef.current = null
        }
    }, [setPlaying, setNeedsGesture, tryPlay])

    useEffect(() => {
        if (!libraryReady) return
        let cancelled = false
        retryRef.current = 0
        void resolveTrackSrc(trackId).then(src => {
            if (!cancelled) setResolvedSrc(src)
        })
        return () => { cancelled = true }
    }, [trackId, libraryReady, resolveTrackSrc])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio || !resolvedSrc) return
        const currentSrc = audio.getAttribute('data-src')
        if (currentSrc === resolvedSrc && audio.src && !audio.error) {
            if (audio.paused) void tryPlay(audio)
            return
        }

        audio.src = resolvedSrc
        audio.setAttribute('data-src', resolvedSrc)
        audio.load()
        void tryPlay(audio)
    }, [resolvedSrc, tryPlay])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        audio.muted = muted
        audio.volume = muted ? 0 : volume
    }, [volume, muted])

    useEffect(() => {
        const onGesture = () => {
            const audio = audioRef.current
            if (!audio) return
            const { needsGesture } = useBgmStore.getState()
            if (!needsGesture && !audio.paused) return

            if (!audio.src && resolvedSrc) {
                audio.src = resolvedSrc
                audio.setAttribute('data-src', resolvedSrc)
            }
            if (!audio.src) return
            void tryPlay(audio)
        }

        const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart']
        events.forEach(e => window.addEventListener(e, onGesture, { passive: true }))
        return () => events.forEach(e => window.removeEventListener(e, onGesture))
    }, [resolvedSrc, tryPlay])

    useEffect(() => {
        if (achievements.length < BADGE_DEFINITIONS.length) return
        if (!hasAllBadgesUnlocked(achievements)) return

        const { justUnlockedHidden } = unlockAllBadgeTracks()
        if (!justUnlockedHidden) return

        selectTrack('waiting-for-the-sun', false)
        const audio = audioRef.current
        if (!audio) return
        const waiting = BGM_TRACKS.find(t => t.id === 'waiting-for-the-sun')!
        const src = bgmTrackUrl(waiting.file!)
        audio.src = src
        audio.setAttribute('data-src', src)
        setResolvedSrc(src)
        void tryPlay(audio)
    }, [achievements, unlockAllBadgeTracks, selectTrack, tryPlay])

    return null
}
