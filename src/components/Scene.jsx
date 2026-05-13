'use client'
import { Canvas, useFrame } from "@react-three/fiber"
import { ACESFilmicToneMapping, FrontSide, MathUtils, MeshStandardMaterial, PointLight, Color, Vector3 } from "three"
import { useGLTF, OrbitControls } from "@react-three/drei"
import { useEffect, useRef } from "react"

function Model() {
    const { scene } = useGLTF('/models/SalaColab.glb')

    useEffect(() => {
        // Apply backface culling: only render front faces
        // This makes walls invisible when viewed from outside
        scene.traverse((node) => {
            if (node.isMesh && node.material) {
                if (Array.isArray(node.material)) {
                    node.material.forEach(mat => {
                        mat.side = FrontSide
                    })
                } else {
                    node.material.side = FrontSide
                }
            }
        })
    }, [scene])

    return <primitive object={scene} />
}

function LucesModel() {
    const { scene } = useGLTF('/models/Luces.glb')
    const lightMaterialsRef = useRef([])
    const startTimeRef = useRef(null)

    useEffect(() => {
        // Initialize light materials, pointLights and parameters
        const materials = []
        scene.traverse((node) => {
            if (node.isMesh) {
                const material = new MeshStandardMaterial({
                    color: '#ff0000',
                    emissive: '#ff0000',
                    emissiveIntensity: 0,
                    roughness: 0.4,
                    metalness: 0.2
                })
                node.material = material

                // Create a PointLight for each sphere
                if (!node.geometry.boundingBox) {
                    node.geometry.computeBoundingBox()
                }
                const localCenter = new Vector3()
                if (node.geometry.boundingBox) {
                    node.geometry.boundingBox.getCenter(localCenter)
                }

                const pointLight = new PointLight(0xff0000, 1, 8)
                pointLight.intensity = 0
                pointLight.position.copy(localCenter)
                node.add(pointLight)

                materials.push({
                    material,
                    pointLight,
                    node,
                    phase: Math.random() * Math.PI * 2,
                    frequency: 0.8 * (0.8 + Math.random() * 0.4),
                    tempColor: new Color()
                })
            }
        })
        lightMaterialsRef.current = materials
        console.info('LucesModel pointLights creadas:', materials.length)
        if (materials.length <= 1) {
            console.warn('LucesModel detecto 1 malla de luz; si el GLB esta unido en una sola malla, solo habra una pointLight.')
        }

        // Cleanup on unmount
        return () => {
            materials.forEach(({ material, pointLight, node }) => {
                material.dispose()
                node.remove(pointLight)
            })
        }
    }, [scene])

    // Animation loop
    useFrame((state) => {
        if (startTimeRef.current === null) {
            startTimeRef.current = state.clock.elapsedTime
        }

        const elapsedTime = state.clock.elapsedTime
        const convergenceDuration = 120
        const globalFrequency = 0.8
        const amplitude = 5

        lightMaterialsRef.current.forEach(({ material, pointLight, phase, frequency, tempColor }) => {
            // Local oscillator
            const localOscillation = Math.abs(Math.sin((elapsedTime + phase) / frequency) * amplitude)
            
            // Global oscillator
            const globalOscillation = Math.abs(Math.sin(elapsedTime / globalFrequency) * amplitude)
            
            // Convergence: transition from local to global over time
            const timeSinceStart = Math.max(0, elapsedTime - startTimeRef.current)
            const syncFactor = Math.min(timeSinceStart / convergenceDuration, 1)
            
            // Interpolate between local and global
            const intensity = MathUtils.lerp(localOscillation, globalOscillation, syncFactor)
            
            // Normalize intensity to 0-1 for color mapping (amplitude = 5)
            const normalizedIntensity = Math.max(0, Math.min(intensity / amplitude, 1))
            
            // Interpolate color from red to black based on normalizedIntensity
            // At full intensity: red (1, 0, 0), at zero intensity: black (0, 0, 0)
            tempColor.setRGB(normalizedIntensity, 0, 0)
            
            // Apply color and intensity to material
            material.color.copy(tempColor)
            material.emissive.copy(tempColor)
            material.emissiveIntensity = intensity
            
            // Apply intensity to pointLight
            pointLight.intensity = intensity
        })
    })

    return <primitive object={scene} />
}

function SceneContent() {
    const onDoubleClick = (e) => {
        e.target.requestFullscreen().catch((err) => {
            alert('Open in a seperate tab to allow fullscreen access')
        })
    }

    return (
        <Canvas onDoubleClick={onDoubleClick}
            camera={{ position: [0, 2, 0] }}
            gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 2.5 }}
        >
            <ambientLight intensity={0.05} color={'#ffffff'} />
            <Model />
            <LucesModel />
            <OrbitControls enableDamping dampingFactor={0.05} />
        </Canvas>
    )
}

export default function Scene() {
    return <SceneContent />
}
