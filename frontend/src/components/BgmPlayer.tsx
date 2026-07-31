import { useEffect, useRef } from 'react'
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
    const trackId = useBgmStore(s => s.trackId)
    const volume = useBgmStore(s => s.volume)
    const muted = useBgmStore(s => s.muted)
    const setPlaying = useBgmStore(s => s.setPlaying)
    const setNeedsGesture = useBgmStore(s => s.setNeedsGesture)
    const unlockAllBadgeTracks = useBgmStore(s => s.unlockAllBadgeTracks)
    const selectTrack = useBgmStore(s => s.selectTrack)

    const achievements = useAchievementStore(s => s.achievements)

    const track = BGM_TRACKS.find(t => t.id === trackId) ?? BGM_TRACKS[0]
    const src = bgmTrackUrl(track.file)

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
        const audio = audioRef.current
        if (!audio) return
        const currentFile = audio.getAttribute('data-file')
        if (currentFile === track.file && audio.src) return

        audio.src = src
        audio.setAttribute('data-file', track.file)
        audio.volume = muted ? 0 : volume
        void audio.play()
            .then(() => {
                setNeedsGesture(false)
                setPlaying(true)
            })
            .catch(() => setNeedsGesture(true))
    }, [src, track.file, muted, volume, setNeedsGesture, setPlaying])

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return
        audio.volume = muted ? 0 : volume
        audio.muted = muted
    }, [volume, muted])

    // First gesture unlocks autoplay for CETA (and later tracks).
    useEffect(() => {
        const tryStart = () => {
            const audio = audioRef.current
            if (!audio) return
            if (!audio.src) {
                audio.src = src
                audio.setAttribute('data-file', track.file)
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
    }, [src, track.file, muted, volume, setNeedsGesture, setPlaying])

    // All badges → unlock hidden tracks + autoplay Waiting for the Sun.
    useEffect(() => {
        if (achievements.length < BADGE_DEFINITIONS.length) return
        if (!hasAllBadgesUnlocked(achievements)) return

        const { justUnlockedHidden } = unlockAllBadgeTracks()
        if (!justUnlockedHidden) return

        selectTrack('waiting-for-the-sun', false)
        const audio = audioRef.current
        if (!audio) return
        const waiting = BGM_TRACKS.find(t => t.id === 'waiting-for-the-sun')!
        audio.src = bgmTrackUrl(waiting.file)
        audio.setAttribute('data-file', waiting.file)
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
