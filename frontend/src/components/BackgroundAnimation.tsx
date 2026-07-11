import { useEffect } from 'react'

export default function BackgroundAnimation() {
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
            const particleCount = 55
            for (let i = 0; i < particleCount; i++) {
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
        <div className="bg-animation" aria-hidden="true">
            <div className="neural-network" id="neuralNetwork" />
            <div className="particles" id="particles" />
        </div>
    )
}
