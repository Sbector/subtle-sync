import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'

export default function Light({
    position = [0, 2, 0],
    color = '#ff0000',
    radius = 0.1,
    frequency = 0.8,
    amplitude = 5,
    phase = 0,
    clusterStartTime = 0,
    convergenceDuration = 120,
    globalFrequency = 0.8
}) {
    const lightRef = useRef()
    const meshRef = useRef()

    useFrame((state) => {
        if (lightRef.current && meshRef.current) {
            const elapsedTime = state.clock.elapsedTime
            
            // Local oscillator with individual frequency and phase
            const localOscillation = Math.abs(Math.sin((elapsedTime + phase) / frequency) * amplitude)
            
            // Global oscillator using globalFrequency (shared across all lights)
            const globalOscillation = Math.abs(Math.sin(elapsedTime / globalFrequency) * amplitude)
            
            // Calculate convergence progress: 0 to 1 over convergenceDuration seconds
            const timeSinceStart = Math.max(0, elapsedTime - clusterStartTime)
            const syncFactor = Math.min(timeSinceStart / convergenceDuration, 1)
            
            // Smooth interpolation from local to global oscillation
            const intensity = THREE.MathUtils.lerp(localOscillation, globalOscillation, syncFactor)
            
            // Update light intensity
            lightRef.current.intensity = intensity
            
            // Update mesh emissive intensity in sync with light
            meshRef.current.material.emissiveIntensity = intensity
        }
    })

    return (
        <group position={position}>
            <pointLight
                ref={lightRef}
                intensity={0}
                color={color}
            />
            <mesh ref={meshRef}>
                <sphereGeometry args={[radius, 16, 8]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={0}
                    roughness={0.4}
                    metalness={0.2}
                />
            </mesh>
        </group>
    )
}
