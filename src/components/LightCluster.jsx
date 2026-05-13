import { useFrame } from '@react-three/fiber'
import { useRef, useMemo, useState, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import Light from './Light'

export default function LightCluster({
    count = 6,
    color = '#ff0000',
    radius = 0.1,
    frequency = 0.8,
    amplitude = 5,
    convergenceDuration = 120,
    minSeparation = 1.5
}) {
    const clusterRef = useRef()
    const startTimeRef = useRef(null)
    const [roomBounds, setRoomBounds] = useState(null)

    // Load model to calculate real bounds
    const { scene } = useGLTF('/models/SalaColab.glb')

    // Calculate room bounds from model on mount
    useEffect(() => {
        if (scene && !roomBounds) {
            const box = new THREE.Box3().setFromObject(scene)
            const margin = 0.3 // Contraction margin to keep lights inside
            const bounds = {
                x: [box.min.x + margin, box.max.x - margin],
                y: [box.min.y + margin, box.max.y - margin],
                z: [box.min.z + margin, box.max.z - margin]
            }
            setRoomBounds(bounds)
        }
    }, [scene])

    // Generate light positions and initial phases
    const lightConfigs = useMemo(() => {
        if (!roomBounds) return []
        
        const lights = []
        let attempts = 0
        const maxAttempts = count * 10

        // Try to place lights with minimum separation
        while (lights.length < count && attempts < maxAttempts) {
            const x = Math.random() * (roomBounds.x[1] - roomBounds.x[0]) + roomBounds.x[0]
            const y = Math.random() * (roomBounds.y[1] - roomBounds.y[0]) + roomBounds.y[0]
            const z = Math.random() * (roomBounds.z[1] - roomBounds.z[0]) + roomBounds.z[0]
            
            const position = [x, y, z]
            
            // Check separation from existing lights
            const isFarEnough = lights.every(light => {
                const dx = light.position[0] - x
                const dy = light.position[1] - y
                const dz = light.position[2] - z
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
                return distance >= minSeparation
            })

            if (isFarEnough) {
                lights.push({
                    id: lights.length,
                    position,
                    phase: (Math.random() * Math.PI * 2),
                    frequency: frequency * (0.8 + Math.random() * 0.4) // Slight variation in frequency
                })
            }

            attempts++
        }

        return lights
    }, [count, roomBounds, minSeparation, frequency])

    // Initialize start time on first frame
    useFrame((state) => {
        if (startTimeRef.current === null) {
            startTimeRef.current = state.clock.elapsedTime
        }
    })

    return (
        <group ref={clusterRef}>
            {lightConfigs.map((config) => (
                <Light
                    key={config.id}
                    position={config.position}
                    color={color}
                    radius={radius}
                    frequency={config.frequency}
                    amplitude={amplitude}
                    phase={config.phase}
                    clusterStartTime={startTimeRef.current ?? 0}
                    convergenceDuration={convergenceDuration}
                    globalFrequency={frequency}
                />
            ))}
        </group>
    )
}
