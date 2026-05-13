'use client'

import { useEffect, useRef, useState } from 'react'

const MOVEMENT_SCALE = 0.15
const LOOK_SCALE = 0.03

export default function MobileControls({ onMovement, onLook }) {
    const joystickLeftRef = useRef(null)
    const joystickRightRef = useRef(null)
    const [isMobile, setIsMobile] = useState(false)
    const leftJoystickRef = useRef(null)
    const rightJoystickRef = useRef(null)
    const lookAccumRef = useRef({ x: 0, y: 0 })

    // Effect A: Detect touch device once
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

        if (isTouchDevice()) {
            setIsMobile(true)
        }
    }, [])

    // Effect B: Initialize joysticks when isMobile=true and refs exist
    useEffect(() => {
        if (!isMobile || !joystickLeftRef.current || !joystickRightRef.current) return

        let cleanup = () => {}

        import('nipplejs').then((nippleModule) => {
            const nipplejs = nippleModule.default

            // Left joystick for movement
            leftJoystickRef.current = nipplejs.create({
                zone: joystickLeftRef.current,
                mode: 'static',
                position: { left: '50%', bottom: '50%' },
                restOpacity: 0.5,
                color: 'white',
            })

            leftJoystickRef.current.on('move', (evt, data) => {
                const angle = data.angle.radian
                const force = Math.min(data.force, 1)
                const x = Math.cos(angle) * force * MOVEMENT_SCALE
                const z = -Math.sin(angle) * force * MOVEMENT_SCALE
                onMovement({ x, z })
            })

            leftJoystickRef.current.on('end', () => {
                onMovement({ x: 0, z: 0 })
            })

            // Right joystick for look
            rightJoystickRef.current = nipplejs.create({
                zone: joystickRightRef.current,
                mode: 'dynamic',
                color: 'blue',
                restOpacity: 0.2,
            })

            rightJoystickRef.current.on('move', (evt, data) => {
                const angle = data.angle.radian
                const force = Math.min(data.force, 1)
                const x = Math.cos(angle) * force
                const y = Math.sin(angle) * force
                
                lookAccumRef.current.x = x * LOOK_SCALE
                lookAccumRef.current.y = -y * LOOK_SCALE
                
                onLook(lookAccumRef.current)
            })

            rightJoystickRef.current.on('end', () => {
                lookAccumRef.current = { x: 0, y: 0 }
                onLook({ x: 0, y: 0 })
            })

            cleanup = () => {
                if (leftJoystickRef.current) {
                    leftJoystickRef.current.destroy()
                    leftJoystickRef.current = null
                }
                if (rightJoystickRef.current) {
                    rightJoystickRef.current.destroy()
                    rightJoystickRef.current = null
                }
            }
        }).catch((err) => {
            console.error('Failed to load nipplejs:', err)
        })

        return cleanup
    }, [isMobile, onMovement, onLook])

    if (!isMobile) return null

    return (
        <>
            {/* Left joystick - Movement */}
            <div
                ref={joystickLeftRef}
                style={{
                    position: 'fixed',
                    bottom: 30,
                    left: 30,
                    width: 130,
                    height: 130,
                    zIndex: 100,
                    pointerEvents: 'auto',
                }}
            />
            {/* Right area - Look around */}
            <div
                ref={joystickRightRef}
                style={{
                    position: 'fixed',
                    bottom: 30,
                    right: 30,
                    width: 130,
                    height: 130,
                    zIndex: 100,
                    pointerEvents: 'auto',
                }}
            />
        </>
    )
}
