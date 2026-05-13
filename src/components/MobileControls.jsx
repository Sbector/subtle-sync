'use client'

import { useEffect, useRef, useState } from 'react'

export default function MobileControls({ onMovement, onLook }) {
    const joystickLeftRef = useRef(null)
    const joystickRightRef = useRef(null)
    const [isMobile, setIsMobile] = useState(false)
    const leftJoystickRef = useRef(null)
    const rightJoystickRef = useRef(null)

    useEffect(() => {
        // Import nipplejs only on client side
        import('nipplejs').then((nippleModule) => {
            const nipplejs = nippleModule.default

            // Check if device supports touch
            const isTouchDevice = () => {
                return (
                    (typeof window !== 'undefined' &&
                        ('ontouchstart' in window ||
                            navigator.maxTouchPoints > 0 ||
                            navigator.msMaxTouchPoints > 0)) ||
                    window.matchMedia('(pointer: coarse)').matches
                )
            }

            if (!isTouchDevice()) return

            setIsMobile(true)

            // Left joystick for movement
            if (joystickLeftRef.current) {
                leftJoystickRef.current = nipplejs.create({
                    zone: joystickLeftRef.current,
                    mode: 'static',
                    position: { left: '50%', bottom: '50%' },
                    restOpacity: 0.5,
                    color: 'white',
                })

                leftJoystickRef.current.on('move', (evt, data) => {
                    const angle = data.angle.radian
                    const force = data.force
                    const x = Math.cos(angle) * force
                    const y = Math.sin(angle) * force
                    onMovement({ x, z: -y })
                })

                leftJoystickRef.current.on('end', () => {
                    onMovement({ x: 0, z: 0 })
                })
            }

            // Right area for look (drag-based)
            if (joystickRightRef.current) {
                rightJoystickRef.current = nipplejs.create({
                    zone: joystickRightRef.current,
                    mode: 'dynamic',
                    color: 'blue',
                    restOpacity: 0.2,
                })

                let lastX = 0
                let lastY = 0

                rightJoystickRef.current.on('move', (evt, data) => {
                    const angle = data.angle.radian
                    const force = data.force * 0.005 // Reduce sensitivity
                    const x = Math.cos(angle) * force
                    const y = Math.sin(angle) * force
                    
                    const deltaX = x - lastX
                    const deltaY = y - lastY
                    
                    onLook({ deltaX, deltaY })
                    
                    lastX = x
                    lastY = y
                })

                rightJoystickRef.current.on('end', () => {
                    lastX = 0
                    lastY = 0
                    onLook({ deltaX: 0, deltaY: 0 })
                })
            }

            return () => {
                if (leftJoystickRef.current) leftJoystickRef.current.destroy()
                if (rightJoystickRef.current) rightJoystickRef.current.destroy()
            }
        })
    }, [onMovement, onLook])

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
