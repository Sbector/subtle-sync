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

function LucesModel({ listener, audioEnabled = false, modelPath = '/models/Luces.glb' }) {
    const { scene } = useGLTF(modelPath)
    const lightMaterialsRef = useRef([])
    const audioNodesRef = useRef([])
    const audioBufferRef = useRef(null)

    // Load audio buffer once, shared across all spheres
    useEffect(() => {
        const loader = new AudioLoader()
        loader.load('/audio/Pulse2.wav', (buffer) => {
            audioBufferRef.current = buffer
        })
    }, [])

    // Initialize materials and point lights — always runs, no listener dependency
    useEffect(() => {
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
                    localCenter,
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
            materials.forEach(({ material, pointLight, node }) => {
                material.dispose()
                node.remove(pointLight)
            })
            lightMaterialsRef.current = []
        }
    }, [scene])

    // Set up positional audio nodes — only when listener is available
    useEffect(() => {
        // Cleanup any previous audio nodes
        audioNodesRef.current.forEach(({ positionalAudio, node }) => {
            if (positionalAudio.isPlaying) positionalAudio.stop()
            node.remove(positionalAudio)
        })
        audioNodesRef.current = []

        if (!listener) return

        const audioNodes = []
        lightMaterialsRef.current.forEach(({ node, localCenter }) => {
            const positionalAudio = new PositionalAudio(listener)
            positionalAudio.setRefDistance(2)
            positionalAudio.setLoop(false)
            positionalAudio.setVolume(0.35)
            positionalAudio.position.copy(localCenter)
            node.add(positionalAudio)
            audioNodes.push({ positionalAudio, node })
        })
        audioNodesRef.current = audioNodes

        return () => {
            audioNodes.forEach(({ positionalAudio, node }) => {
                if (positionalAudio.isPlaying) positionalAudio.stop()
                node.remove(positionalAudio)
            })
            audioNodesRef.current = []
        }
    }, [listener])

    // Animation loop — always runs
    useFrame((state) => {
        const elapsedTime = state.clock.elapsedTime
        const cycleDuration = 60
        const globalFrequency = 0.8
        const amplitude = 5
        const audioTriggerFactor = 0.4

        // Cyclic sync/desync: oscillates smoothly between 0 and 1
        const syncFactor = (Math.sin(elapsedTime / cycleDuration * Math.PI * 2 - Math.PI / 2) + 1) / 2

        lightMaterialsRef.current.forEach((entry, i) => {
            const { material, pointLight, phase, frequency, tempColor } = entry

            // Local oscillator
            const localOscillation = Math.abs(Math.sin((elapsedTime + phase) / frequency) * amplitude)
            // Global oscillator
            const globalOscillation = Math.abs(Math.sin(elapsedTime / globalFrequency) * amplitude)
            // Interpolate between local and global
            const intensity = MathUtils.lerp(localOscillation, globalOscillation, syncFactor)

            // Detect peak: trigger audio if enabled and node exists
            const peakThreshold = audioTriggerFactor * amplitude
            if (audioEnabled && intensity > peakThreshold && entry.prevIntensity <= peakThreshold) {
                const audioNode = audioNodesRef.current[i]
                if (audioNode && audioBufferRef.current) {
                    const { positionalAudio } = audioNode
                    const ctx = ThreeAudioContext.getContext()
                    if (positionalAudio.isPlaying) positionalAudio.stop()
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

function SceneInner({ sceneState = 3, orbitEnabled = false, audioEnabled = false }) {
    const { camera } = useThree()
    const [listener, setListener] = useState(null)

    // Create AudioListener and attach to camera only when audioEnabled is true
    useEffect(() => {
        if (!audioEnabled) {
            setListener(null)
            return
        }

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
    }, [camera, audioEnabled])

    const modelPath = sceneState === 3 ? '/models/Luces2.glb' : '/models/Luces.glb'
    const ambientIntensity = sceneState === 1 ? 0.4 : 0.05

    return (
        <>
            <ambientLight intensity={ambientIntensity} color={'#ffffff'} />
            <Model />
            {sceneState !== 1 && <LucesModel listener={listener} audioEnabled={audioEnabled} modelPath={modelPath} />}
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
    const [audioEnabled, setAudioEnabled] = useState(false)

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
                    <SceneInner sceneState={sceneState} orbitEnabled={orbitEnabled} audioEnabled={audioEnabled} />
                </Canvas>
                <StateHUD sceneState={sceneState} onStateChange={setSceneState} visible={orbitEnabled} />
                {/* Audio toggle button */}
                <button
                    onClick={() => setAudioEnabled(!audioEnabled)}
                    style={{
                        position: 'fixed',
                        bottom: '2rem',
                        right: '2rem',
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: 'rgba(0, 0, 0, 0.45)',
                        border: '1px solid rgba(255, 255, 255, 0.5)',
                        color: '#ffffff',
                        cursor: 'pointer',
                        zIndex: 30,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        transition: 'opacity 0.2s ease',
                        opacity: audioEnabled ? 1 : 0.5
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = audioEnabled ? '1' : '0.5' }}
                    title={audioEnabled ? 'Desactivar sonido' : 'Activar sonido'}
                    aria-label={audioEnabled ? 'Desactivar sonido' : 'Activar sonido'}
                >
                    {audioEnabled ? (
                        /* Speaker with sound waves */
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M15.54 3.54a8 8 0 0 1 0 11.32"></path>
                            <path d="M19.07 4.93a16 16 0 0 1 0 22.63"></path>
                        </svg>
                    ) : (
                        /* Speaker muted */
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <line x1="23" y1="9" x2="17" y2="15"></line>
                            <line x1="17" y1="9" x2="23" y2="15"></line>
                        </svg>
                    )}
                </button>
            </div>
        </>
    )
}
