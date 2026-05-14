'use client'
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { ACESFilmicToneMapping, FrontSide, MathUtils, MeshStandardMaterial, PointLight, Color, Vector3, AudioListener, PositionalAudio, AudioLoader, AudioContext as ThreeAudioContext } from "three"
import { useGLTF, OrbitControls } from "@react-three/drei"
import { useEffect, useRef, useState } from "react"

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

function LucesModel({ listener, modelPath = '/models/Luces.glb' }) {
    const { scene } = useGLTF(modelPath)
    const lightMaterialsRef = useRef([])
    const audioBufferRef = useRef(null)

    // Load audio buffer once, shared across all spheres
    useEffect(() => {
        const loader = new AudioLoader()
        loader.load('/audio/Pulse.wav', (buffer) => {
            audioBufferRef.current = buffer
        })
    }, [])

    useEffect(() => {
        if (!listener) return

        // Initialize light materials, pointLights, positionalAudio and parameters
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

                // Position point light at geometric center of each sphere
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

                // Positional audio for this sphere
                const positionalAudio = new PositionalAudio(listener)
                positionalAudio.setRefDistance(2)
                positionalAudio.setLoop(false)
                positionalAudio.setVolume(0.35)
                positionalAudio.position.copy(localCenter)
                node.add(positionalAudio)

                materials.push({
                    material,
                    pointLight,
                    positionalAudio,
                    node,
                    phase: Math.random() * Math.PI * 2,
                    frequency: 0.8 * (0.8 + Math.random() * 0.4),
                    tempColor: new Color(),
                    prevIntensity: 0
                })
            }
        })
        lightMaterialsRef.current = materials

        return () => {
            materials.forEach(({ material, pointLight, positionalAudio, node }) => {
                material.dispose()
                node.remove(pointLight)
                if (positionalAudio.isPlaying) positionalAudio.stop()
                node.remove(positionalAudio)
            })
        }
    }, [scene, listener])

    // Animation loop
    useFrame((state) => {
        const elapsedTime = state.clock.elapsedTime
        const cycleDuration = 60
        const globalFrequency = 0.8
        const amplitude = 5
        const audioTriggerFactor = 0.4  // Adjust this to sync audio timing: lower = earlier trigger, higher = later

        // Cyclic sync/desync: oscillates smoothly between 0 and 1
        const syncFactor = (Math.sin(elapsedTime / cycleDuration * Math.PI * 2 - Math.PI / 2) + 1) / 2

        lightMaterialsRef.current.forEach((entry) => {
            const { material, pointLight, positionalAudio, phase, frequency, tempColor } = entry

            // Local oscillator
            const localOscillation = Math.abs(Math.sin((elapsedTime + phase) / frequency) * amplitude)
            // Global oscillator
            const globalOscillation = Math.abs(Math.sin(elapsedTime / globalFrequency) * amplitude)
            // Interpolate between local and global
            const intensity = MathUtils.lerp(localOscillation, globalOscillation, syncFactor)

            // Detect peak: intensity rises above audioTriggerFactor% of amplitude
            const peakThreshold = audioTriggerFactor * amplitude
            if (intensity > peakThreshold && entry.prevIntensity <= peakThreshold) {
                if (audioBufferRef.current) {
                    const ctx = ThreeAudioContext.getContext()
                    // Stop any ongoing playback
                    if (positionalAudio.isPlaying) {
                        positionalAudio.stop()
                    }
                    // Fade in from 0 to 0.35 over 20ms to eliminate clicks
                    const gainParam = positionalAudio.gain.gain
                    gainParam.cancelScheduledValues(ctx.currentTime)
                    gainParam.setValueAtTime(0, ctx.currentTime)
                    gainParam.linearRampToValueAtTime(0.35, ctx.currentTime + 0.02)
                    positionalAudio.setBuffer(audioBufferRef.current)
                    positionalAudio.play()
                }
            }
            entry.prevIntensity = intensity

            // Normalize for color mapping
            const normalizedIntensity = Math.max(0, Math.min(intensity / amplitude, 1))
            tempColor.setRGB(normalizedIntensity, 0, 0)

            material.color.copy(tempColor)
            material.emissive.copy(tempColor)
            material.emissiveIntensity = intensity
            pointLight.intensity = intensity
        })
    })

    return <primitive object={scene} />
}

// Preload both Luces models
useGLTF.preload('/models/Luces.glb')
useGLTF.preload('/models/Luces2.glb')

function SceneInner({ sceneState = 1 }) {
    const { camera } = useThree()
    const listenerRef = useRef(null)

    // Create AudioListener and attach to camera once
    useEffect(() => {
        const listener = new AudioListener()
        camera.add(listener)
        listenerRef.current = listener

        // Insert a DynamicsCompressor to prevent saturation when many spheres fire at once
        const ctx = ThreeAudioContext.getContext()
        const compressor = ctx.createDynamicsCompressor()
        compressor.threshold.value = -24  // More aggressive: -24 dB
        compressor.knee.value = 10        // Soft knee for natural transition
        compressor.ratio.value = 8        // 8:1 compression ratio
        compressor.attack.value = 0.003   // 3ms attack
        compressor.release.value = 0.25   // 250ms release
        // Route: listener gain → compressor → destination
        listener.gain.disconnect()
        listener.gain.connect(compressor)
        compressor.connect(ctx.destination)

        // Resume AudioContext immediately (browsers may still block until first user interaction)
        const unlock = () => {
            ctx.resume()
        }
        ctx.resume().catch(() => {
            // Fallback: unlock on first user interaction
            window.addEventListener('pointerdown', unlock)
        })

        return () => {
            camera.remove(listener)
            compressor.disconnect()
            window.removeEventListener('pointerdown', unlock)
        }
    }, [camera])

    const modelPath = sceneState === 3 ? '/models/Luces2.glb' : '/models/Luces.glb'
    const ambientIntensity = sceneState === 1 ? 0.4 : 0.05

    return (
        <>
            <ambientLight intensity={ambientIntensity} color={'#ffffff'} />
            <Model />
            {sceneState !== 1 && <LucesModel listener={listenerRef.current} modelPath={modelPath} />}
            <OrbitControls enableDamping dampingFactor={0.05} />
        </>
    )
}

function StateHUD({ sceneState, onStateChange }) {
    const [isOpen, setIsOpen] = useState(false)

    const states = [
        { id: 1, label: 'Espacio Limpio' },
        { id: 2, label: 'Propuesta 1' },
        { id: 3, label: 'Propuesta 2' }
    ]

    return (
        <div className="absolute top-4 right-4 z-10">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="bg-black/50 hover:bg-black/70 text-white px-3 py-2 rounded text-sm font-semibold transition-colors"
            >
                {isOpen ? '✕' : '▾'} Estado
            </button>
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 bg-black/80 rounded shadow-lg overflow-hidden min-w-max">
                    {states.map((state) => (
                        <button
                            key={state.id}
                            onClick={() => {
                                onStateChange(state.id)
                                setIsOpen(false)
                            }}
                            className={`block w-full text-left px-4 py-2 text-sm transition-colors ${
                                sceneState === state.id
                                    ? 'bg-red-600 text-white font-semibold'
                                    : 'bg-black/60 hover:bg-black/80 text-white'
                            }`}
                        >
                            {state.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

function SceneContent({ sceneState, onStateChange }) {
    const onDoubleClick = (e) => {
        e.target.requestFullscreen().catch((err) => {
            alert('Open in a seperate tab to allow fullscreen access')
        })
    }

    return (
        <div className="relative w-full h-full">
            <Canvas onDoubleClick={onDoubleClick}
                camera={{ position: [0, 2, 0] }}
                gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 2.5 }}
            >
                <SceneInner sceneState={sceneState} />
            </Canvas>
            <StateHUD sceneState={sceneState} onStateChange={onStateChange} />
        </div>
    )
}

export default function Scene() {
    const [sceneState, setSceneState] = useState(1)

    return <SceneContent sceneState={sceneState} onStateChange={setSceneState} />
}
