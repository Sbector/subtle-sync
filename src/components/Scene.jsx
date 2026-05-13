'use client'
import { Canvas } from "@react-three/fiber"
import { ACESFilmicToneMapping } from "three"
import Light from "./Light"
import { ArcballControls } from "@react-three/drei"

export default function Scene() {
    const onDoubleClick = (e) => {
        e.target.requestFullscreen().catch((err) => {
            alert('Open in a seperate tab to allow fullscreen access')
        })
    }

    return (
        <Canvas onDoubleClick={onDoubleClick}
            camera={{ position: [0, 0, 3] }}
            gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 2.5 }}
        >
            <Light />
            <ArcballControls
                enablePan={false}
                minDistance={1.5}
                maxDistance={3}
            />
        </Canvas>
    )
}
