'use client'
import { Canvas } from "@react-three/fiber"
import { ACESFilmicToneMapping, FrontSide } from "three"
import LightCluster from "./LightCluster"
import { useGLTF, OrbitControls } from "@react-three/drei"
import { useEffect } from "react"

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
            <ambientLight intensity={0.05} />
            <LightCluster />
            <Model />
            <OrbitControls enableDamping dampingFactor={0.05} />
        </Canvas>
    )
}

export default function Scene() {
    return <SceneContent />
}
