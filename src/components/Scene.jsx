'use client'
import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { ACESFilmicToneMapping, Vector3, Euler } from "three"
import Light from "./Light"
import { PointerLockControls, useGLTF, KeyboardControls, useKeyboardControls, Html } from "@react-three/drei"
import MobileControls from "./MobileControls"
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
    return <primitive object={scene} />
}

function FPSMovement({ mobileMovementRef, mobileLookRef, pointerLockRef }) {
    const { camera } = useThree()
    const [, get] = useKeyboardControls()
    
    const direction = new Vector3()
    const euler = new Euler(0, 0, 0, 'YXZ')
    const lastLookRef = useRef({ x: 0, y: 0 })

    useFrame(() => {
        const state = get()
        direction.set(0, 0, 0)

        // Keyboard movement
        if (state.left) direction.x -= 1
        if (state.right) direction.x += 1
        if (state.forward) direction.z -= 1
        if (state.back) direction.z += 1

        // Mobile movement (already scaled)
        const mobileMove = mobileMovementRef.current
        direction.x += mobileMove.x
        direction.z += mobileMove.z

        // Apply movement
        if (direction.length() > 0) {
            direction.normalize()
            camera.translateX(direction.x * MOVE_SPEED_KEYBOARD)
            camera.translateZ(direction.z * MOVE_SPEED_KEYBOARD)
        }

        // Mobile look (if pointer lock is not active)
        if (pointerLockRef.current && !pointerLockRef.current.isLocked) {
            const mobileLook = mobileLookRef.current
            
            // Apply damping for smooth look
            lastLookRef.current.x = lastLookRef.current.x * LOOK_DAMPING + mobileLook.x * (1 - LOOK_DAMPING)
            lastLookRef.current.y = lastLookRef.current.y * LOOK_DAMPING + mobileLook.y * (1 - LOOK_DAMPING)
            
            euler.setFromQuaternion(camera.quaternion)
            euler.rotateY(-lastLookRef.current.x)
            euler.rotateX(-lastLookRef.current.y)
            
            // Clamp pitch to prevent flipping
            euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x))
            
            camera.quaternion.setFromEuler(euler)
        }
    })

    return null
}

function PointerLock({ pointerLockRef }) {
    const { camera, gl } = useThree()
    const [isDesktop, setIsDesktop] = useState(true)

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

    return (
        <>
            <PointerLockControls
                ref={pointerLockRef}
                camera={camera}
                domElement={gl.domElement}
            />
            {isDesktop && (
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
            )}
        </>
    )
}

function SceneContent({ mobileMovementRef, mobileLookRef, pointerLockRef }) {
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
            <PointerLock pointerLockRef={pointerLockRef} />
            <FPSMovement mobileMovementRef={mobileMovementRef} mobileLookRef={mobileLookRef} pointerLockRef={pointerLockRef} />
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

    const mobileMovementRef = useRef({ x: 0, z: 0 })
    const mobileLookRef = useRef({ x: 0, y: 0 })
    const pointerLockRef = useRef(null)

    const handleMobileMovement = (movement) => {
        mobileMovementRef.current = movement
    }

    const handleMobileLook = (look) => {
        mobileLookRef.current = look
    }

    return (
        <KeyboardControls map={keyboardMap}>
            <SceneContent 
                mobileMovementRef={mobileMovementRef}
                mobileLookRef={mobileLookRef}
                pointerLockRef={pointerLockRef}
            />
            <MobileControls
                onMovement={handleMobileMovement}
                onLook={handleMobileLook}
            />
        </KeyboardControls>
    )
}
