'use client'
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { ACESFilmicToneMapping, Vector3, Euler, FrontSide } from "three"
import Light from "./Light"
import { PointerLockControls, useGLTF, KeyboardControls, useKeyboardControls, Html, OrbitControls } from "@react-three/drei"
import { useMemo, useState, useRef, useEffect } from "react"

const Controls = {
    forward: 'forward',
    back: 'back',
    left: 'left',
    right: 'right',
}

const MOVE_SPEED_KEYBOARD = 0.1
const LOOK_DAMPING = 0.85

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

function FPSMovement({ pointerLockRef }) {
    const { camera } = useThree()
    const [, get] = useKeyboardControls()
    
    const direction = new Vector3()
    const euler = new Euler(0, 0, 0, 'YXZ')

    useFrame(() => {
        const state = get()
        direction.set(0, 0, 0)

        // Keyboard movement
        if (state.left) direction.x -= 1
        if (state.right) direction.x += 1
        if (state.forward) direction.z -= 1
        if (state.back) direction.z += 1

        // Apply movement
        if (direction.length() > 0) {
            direction.normalize()
            camera.translateX(direction.x * MOVE_SPEED_KEYBOARD)
            camera.translateZ(direction.z * MOVE_SPEED_KEYBOARD)
        }
    })

    return null
}

function PointerLock({ pointerLockRef }) {
    const { camera, gl } = useThree()

    return (
        <>
            <PointerLockControls
                ref={pointerLockRef}
                camera={camera}
                domElement={gl.domElement}
            />
            <Html fullScreen>
                <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    textAlign: 'center',
                    color: 'white',
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    zIndex: 10
                }}
                onClick={() => {
                    pointerLockRef.current?.lock?.()
                }}
                >
                    <div style={{
                        background: 'rgba(0, 0, 0, 0.7)',
                        padding: '40px',
                        borderRadius: '8px',
                        border: '2px solid rgba(255, 255, 255, 0.3)'
                    }}>
                        <h2 style={{ margin: '0 0 10px 0', fontSize: '24px' }}>Click to explore</h2>
                        <p style={{ margin: '0', fontSize: '14px', opacity: 0.8 }}>WASD to move, mouse to look around</p>
                    </div>
                </div>
            </Html>
        </>
    )
}

function ControlsSelector({ pointerLockRef }) {
    const [isDesktop, setIsDesktop] = useState(null)

    useEffect(() => {
        const isTouchDevice = () => {
            return (
                (typeof window !== 'undefined' &&
                    ('ontouchstart' in window ||
                        navigator.maxTouchPoints > 0 ||
                        navigator.msMaxTouchPoints > 0)) ||
                window.matchMedia('(pointer: coarse)').matches
            )
        }
        setIsDesktop(!isTouchDevice())
    }, [])

    if (isDesktop === null) return null

    if (isDesktop) {
        return (
            <>
                <PointerLock pointerLockRef={pointerLockRef} />
                <FPSMovement pointerLockRef={pointerLockRef} />
            </>
        )
    } else {
        return <OrbitControls enableDamping dampingFactor={0.05} />
    }
}

function SceneContent({ pointerLockRef }) {
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
            <Light />
            <Model />
            <ControlsSelector pointerLockRef={pointerLockRef} />
        </Canvas>
    )
}

export default function Scene() {
    const keyboardMap = useMemo(() => [
        { name: Controls.forward, keys: ['ArrowUp', 'KeyW', 'w'] },
        { name: Controls.back, keys: ['ArrowDown', 'KeyS', 's'] },
        { name: Controls.left, keys: ['ArrowLeft', 'KeyA', 'a'] },
        { name: Controls.right, keys: ['ArrowRight', 'KeyD', 'd'] },
    ], [])

    const pointerLockRef = useRef(null)

    return (
        <KeyboardControls map={keyboardMap}>
            <SceneContent pointerLockRef={pointerLockRef} />
        </KeyboardControls>
    )
}
