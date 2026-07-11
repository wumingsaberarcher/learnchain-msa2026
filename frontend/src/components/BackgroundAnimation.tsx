import { useEffect, useState } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

const TREE_GROWTH_MS = 10 * 60 * 1000 // 10 minutes

function NightBackground() {
    useEffect(() => {
        const createNeuralNetwork = () => {
            const container = document.getElementById('neuralNetwork')
            if (!container) return
            container.innerHTML = ''
            const nodes = 22
            for (let i = 0; i < nodes; i++) {
                const node = document.createElement('div')
                node.className = 'node'
                node.style.left = Math.random() * 100 + '%'
                node.style.top = Math.random() * 100 + '%'
                node.style.animationDelay = Math.random() * 3 + 's'
                container.appendChild(node)

                if (i > 0 && Math.random() > 0.45) {
                    const connection = document.createElement('div')
                    connection.className = 'connection'
                    connection.style.left = Math.random() * 100 + '%'
                    connection.style.top = Math.random() * 100 + '%'
                    connection.style.width = Math.random() * 180 + 60 + 'px'
                    connection.style.animationDelay = Math.random() * 4 + 's'
                    container.appendChild(connection)
                }
            }
        }

        const createParticles = () => {
            const container = document.getElementById('particles')
            if (!container) return
            container.innerHTML = ''
            for (let i = 0; i < 55; i++) {
                const particle = document.createElement('div')
                particle.className = 'particle'
                particle.style.left = Math.random() * 100 + '%'
                particle.style.animationDelay = Math.random() * 7 + 's'
                particle.style.animationDuration = (9 + Math.random() * 5) + 's'
                container.appendChild(particle)
            }
        }

        createNeuralNetwork()
        createParticles()
    }, [])

    return (
        <>
            <div className="neural-network" id="neuralNetwork" />
            <div className="particles" id="particles" />
        </>
    )
}

function DaySun() {
    return (
        <div className="day-sun-container">
            <div className="day-sun-rays" />
            <div className="day-sun-core" />
        </div>
    )
}

function DayParticles() {
    useEffect(() => {
        const container = document.getElementById('dayParticles')
        if (!container) return
        container.innerHTML = ''
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div')
            p.className = 'day-particle'
            p.style.left = Math.random() * 100 + '%'
            p.style.animationDelay = Math.random() * 8 + 's'
            p.style.animationDuration = (12 + Math.random() * 8) + 's'
            container.appendChild(p)
        }
    }, [])

    return <div className="day-particles" id="dayParticles" />
}

function GrowingTree({ progress }: { progress: number }) {
    const p = Math.min(1, Math.max(0, progress))
    const trunkH = 12 + p * 200
    const trunkW = 3 + p * 14
    const canopyR = p < 0.08 ? 6 + p * 30 : 8 + p * 72
    const showBranches = p > 0.25
    const branchSpread = 20 + p * 80
    const branchY = 55 - p * 35
    const leafOpacity = 0.35 + p * 0.65

    return (
        <div className="growing-tree-wrap" style={{ '--tree-progress': String(p) } as React.CSSProperties}>
            <svg
                className="growing-tree-svg"
                viewBox="0 0 200 280"
                preserveAspectRatio="xMidYMax meet"
                aria-hidden="true"
            >
                {/* Ground */}
                <ellipse cx="100" cy="272" rx={60 + p * 40} ry={8 + p * 4} fill="rgba(76,120,68,0.35)" />

                {/* Roots at later stages */}
                {p > 0.5 && (
                    <path
                        d={`M100,${272 - trunkH * 0.1} Q85,268 78,272 M100,${272 - trunkH * 0.1} Q115,268 122,272`}
                        stroke="rgba(90,60,30,0.5)"
                        strokeWidth={2 + p * 2}
                        fill="none"
                    />
                )}

                {/* Trunk */}
                <rect
                    x={100 - trunkW / 2}
                    y={272 - trunkH}
                    width={trunkW}
                    height={trunkH}
                    rx={trunkW * 0.3}
                    fill={`rgb(${90 + p * 30},${55 + p * 20},${30 + p * 10})`}
                />

                {/* Branches */}
                {showBranches && (
                    <>
                        <path
                            d={`M100,${branchY} Q${100 - branchSpread},${branchY - 20 - p * 30} ${100 - branchSpread * 0.7},${branchY - 40 - p * 40}`}
                            stroke={`rgb(${80 + p * 20},${50 + p * 15},${25})`}
                            strokeWidth={2 + p * 3}
                            fill="none"
                            strokeLinecap="round"
                        />
                        <path
                            d={`M100,${branchY + 15} Q${100 + branchSpread},${branchY - 10 - p * 25} ${100 + branchSpread * 0.75},${branchY - 35 - p * 35}`}
                            stroke={`rgb(${80 + p * 20},${50 + p * 15},${25})`}
                            strokeWidth={2 + p * 3}
                            fill="none"
                            strokeLinecap="round"
                        />
                    </>
                )}

                {/* Canopy layers */}
                {p < 0.06 ? (
                    /* Seedling sprout */
                    <g>
                        <ellipse cx="100" cy={272 - trunkH - 4} rx="4" ry="8" fill="#6DBF4E" opacity="0.9" />
                        <ellipse cx="96" cy={272 - trunkH - 6} rx="3" ry="6" fill="#5AAF3E" opacity="0.8" transform="rotate(-20 96 272)" />
                        <ellipse cx="104" cy={272 - trunkH - 6} rx="3" ry="6" fill="#5AAF3E" opacity="0.8" transform="rotate(20 104 272)" />
                    </g>
                ) : (
                    <>
                        <circle cx="100" cy={272 - trunkH - canopyR * 0.5} r={canopyR} fill="#3D8B37" opacity={leafOpacity * 0.7} />
                        <circle cx={100 - canopyR * 0.45} cy={272 - trunkH - canopyR * 0.2} r={canopyR * 0.75} fill="#4CAF50" opacity={leafOpacity * 0.8} />
                        <circle cx={100 + canopyR * 0.4} cy={272 - trunkH - canopyR * 0.25} r={canopyR * 0.7} fill="#5CBF60" opacity={leafOpacity * 0.75} />
                        <circle cx="100" cy={272 - trunkH - canopyR * 0.85} r={canopyR * 0.55} fill="#6DCF65" opacity={leafOpacity} />
                    </>
                )}
            </svg>
        </div>
    )
}

function DayBackground() {
    const [treeProgress, setTreeProgress] = useState(0)

    useEffect(() => {
        const startKey = 'dayTreeGrowthStart'
        let start = sessionStorage.getItem(startKey)
        if (!start) {
            start = String(Date.now())
            sessionStorage.setItem(startKey, start)
        }

        const update = () => {
            const elapsed = Date.now() - Number(start)
            setTreeProgress(Math.min(1, elapsed / TREE_GROWTH_MS))
        }

        update()
        const id = window.setInterval(update, 2000)
        return () => clearInterval(id)
    }, [])

    return (
        <>
            <DaySun />
            <DayParticles />
            <div className="day-light-overlay" />
            <GrowingTree progress={treeProgress} />
        </>
    )
}

export default function BackgroundAnimation() {
    const theme = useSettingsStore(s => s.theme)

    return (
        <div className={`bg-animation theme-${theme}`} aria-hidden="true">
            {theme === 'night' ? <NightBackground /> : <DayBackground />}
        </div>
    )
}
