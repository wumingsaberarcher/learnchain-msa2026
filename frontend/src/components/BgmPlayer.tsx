import { useEffect, useRef, useState } from 'react'
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

    const trackId = useBgmStore(s => s.trackId)
    const volume = useBgmStore(s => s.volume)
    const muted = useBgmStore(s => s.muted)
    const userTracks = useBgmStore(s => s.userTracks)
    const libraryReady = useBgmStore(s => s.libraryReady)
    const setPlaying = useBgmStore(s => s.setPlaying)
    const setNeedsGesture = useBgmStore(s => s.setNeedsGesture)
    const unlockAllBadgeTracks = useBgmStore(s => s.unlockAllBadgeTracks)
    const selectTrack = useBgmStore(s => s.selectTrack)
    const hydrateUserLibrary = useBgmStore(s => s.hydrateUserLibrary)
    const resolveTrackSrc = useBgmStore(s => s.resolveTrackSrc)

    const achievements = useAchievementStore(s => s.achievements)

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
        audio.addEventListener('play', onPlay)
        audio.addEventListener('pause', onPause)

        return () => {
            audio.removeEventListener('play', onPlay)
            audio.removeEventListener('pause', onPause)
            audio.pause()
            audio.src = ''
            audioRef.current = null
        }
    }, [setPlaying])

    useEffect(() => {
        if (!libraryReady) return
        let cancelled = false
        void resolveTrackSrc(trackId).then(src => {
            if (!cancelled) setResolvedSrc(src)
        })
        return () => { cancelled = true }
    }, [trackId, userTracks, libraryReady, resolveTrackSrc])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio || !resolvedSrc) return
        const currentSrc = audio.getAttribute('data-src')
        if (currentSrc === resolvedSrc && audio.src) return

        audio.src = resolvedSrc
        audio.setAttribute('data-src', resolvedSrc)
        audio.volume = muted ? 0 : volume
        void audio.play()
            .then(() => {
                setNeedsGesture(false)
                setPlaying(true)
            })
            .catch(() => setNeedsGesture(true))
    }, [resolvedSrc, muted, volume, setNeedsGesture, setPlaying])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        audio.volume = muted ? 0 : volume
        audio.muted = muted
    }, [volume, muted])

    useEffect(() => {
        const tryStart = () => {
            const audio = audioRef.current
            if (!audio) return
            if (!audio.src && resolvedSrc) {
                audio.src = resolvedSrc
                audio.setAttribute('data-src', resolvedSrc)
            }
            audio.volume = muted ? 0 : volume
            void audio.play()
                .then(() => {
                    setNeedsGesture(false)
                    setPlaying(true)
                })
                .catch(() => setNeedsGesture(true))
        }

        const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart']
        const onGesture = () => {
            if (!useBgmStore.getState().needsGesture && audioRef.current && !audioRef.current.paused) {
                return
            }
            tryStart()
        }
        events.forEach(e => window.addEventListener(e, onGesture, { passive: true }))
        return () => events.forEach(e => window.removeEventListener(e, onGesture))
    }, [resolvedSrc, muted, volume, setNeedsGesture, setPlaying])

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
        audio.volume = muted ? 0 : volume
        void audio.play()
            .then(() => {
                setNeedsGesture(false)
                setPlaying(true)
            })
            .catch(() => setNeedsGesture(true))
    }, [achievements, unlockAllBadgeTracks, selectTrack, muted, volume, setNeedsGesture, setPlaying])

    return null
}
