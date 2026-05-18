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
        loader.load('/audio/Pulse2.wav', (buffer) => {
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

function SceneInner({ sceneState = 3, orbitEnabled = false }) {
    const { camera } = useThree()
    const [listener, setListener] = useState(null)

    // Create AudioListener and attach to camera once
    useEffect(() => {
        const audioListener = new AudioListener()
        camera.add(audioListener)

        // Insert a DynamicsCompressor to prevent saturation when many spheres fire at once
        const ctx = ThreeAudioContext.getContext()
        const compressor = ctx.createDynamicsCompressor()
        compressor.threshold.value = -24  // More aggressive: -24 dB
        compressor.knee.value = 10        // Soft knee for natural transition
        compressor.ratio.value = 8        // 8:1 compression ratio
        compressor.attack.value = 0.003   // 3ms attack
        compressor.release.value = 0.25   // 250ms release
        // Route: listener gain → compressor → destination
        audioListener.gain.disconnect()
        audioListener.gain.connect(compressor)
        compressor.connect(ctx.destination)

        // Resume AudioContext immediately (browsers may still block until first user interaction)
        const unlock = () => {
            ctx.resume()
        }
        ctx.resume().catch(() => {
            // Fallback: unlock on first user interaction
            window.addEventListener('pointerdown', unlock)
        })

        // Trigger re-render so LucesModel receives the real listener
        setListener(audioListener)

        return () => {
            camera.remove(audioListener)
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
            {sceneState !== 1 && <LucesModel listener={listener} modelPath={modelPath} />}
            {orbitEnabled && <OrbitControls enableDamping dampingFactor={0.05} />}
        </>
    )
}

function ExplorationModal({ visible, onDismiss }) {
    if (!visible) return null

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 20,
                backdropFilter: 'blur(2px)'
            }}
            onClick={onDismiss}
        >
            <div
                style={{
                    backgroundColor: 'rgba(10, 10, 10, 0.95)',
                    border: '1px solid rgba(0, 229, 255, 0.3)',
                    borderRadius: '12px',
                    padding: '2rem',
                    maxWidth: '500px',
                    width: '90%',
                    position: 'relative',
                    boxShadow: '0 8px 32px rgba(0, 229, 255, 0.1), 0 0 20px rgba(0, 229, 255, 0.05)',
                    animation: 'fadeInModal 0.4s ease-out'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onDismiss}
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: 'none',
                        border: 'none',
                        color: '#00e5ff',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        padding: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        opacity: 0.8,
                        hover: { opacity: 1 }
                    }}
                    onMouseEnter={(e) => (e.target.style.opacity = '1')}
                    onMouseLeave={(e) => (e.target.style.opacity = '0.8')}
                >
                    ✕
                </button>
                <p
                    style={{
                        fontSize: '1.2rem',
                        color: '#00e5ff',
                        textShadow: '0 2px 10px rgba(0, 229, 255, 0.3)',
                        margin: 0,
                        lineHeight: 1.6,
                        fontWeight: 500
                    }}
                >
                    Modo exploración activado
                </p>
            </div>
            <style>{`
                @keyframes fadeInModal {
                    from {
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
            `}</style>
        </div>
    )
}

function StateHUD({ sceneState, onStateChange, visible = false }) {
    const [isOpen, setIsOpen] = useState(false)

    if (!visible) return null

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

export default function Scene() {
    const [sceneState, setSceneState] = useState(3)
    const [orbitEnabled, setOrbitEnabled] = useState(false)
    const [modalDismissed, setModalDismissed] = useState(false)

    const onDoubleClick = (e) => {
        if (orbitEnabled) {
            e.target.requestFullscreen().catch((err) => {
                alert('Open in a separate tab to allow fullscreen access')
            })
        }
    }

    useEffect(() => {
        if (typeof window === 'undefined') return

        // Disable automatic scroll restoration and reset to top on mount
        history.scrollRestoration = 'manual'
        window.scrollTo(0, 0)

        // Use IntersectionObserver on sentinel to trigger orbit mode
        const sentinel = document.getElementById('explore-trigger')
        if (!sentinel) return

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setOrbitEnabled(true)
                        document.body.style.overflow = 'hidden'
                    }
                })
            },
            { threshold: 0 }
        )

        observer.observe(sentinel)

        return () => {
            observer.unobserve(sentinel)
            observer.disconnect()
            // Restore automatic scroll restoration on cleanup
            history.scrollRestoration = 'auto'
        }
    }, [])

    return (
        <>
            <ExplorationModal visible={orbitEnabled && !modalDismissed} onDismiss={() => setModalDismissed(true)} />
            {/* Dark overlay for text readability */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 1,
                    pointerEvents: 'none',
                    opacity: orbitEnabled ? 0 : 1,
                    transition: 'opacity 0.6s ease'
                }}
            />
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 0,
                    pointerEvents: orbitEnabled ? 'auto' : 'none'
                }}
            >
                <Canvas
                    onDoubleClick={onDoubleClick}
                    camera={{ position: [3.5, 1.5, 4.5] }}
                    gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 2.5 }}
                >
                    <SceneInner sceneState={sceneState} orbitEnabled={orbitEnabled} />
                </Canvas>
                <StateHUD sceneState={sceneState} onStateChange={setSceneState} visible={orbitEnabled} />
            </div>
        </>
    )
}
