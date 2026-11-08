"use client"

import { useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { PerformanceMonitor } from "@react-three/drei"
import { EffectComposer, Bloom } from "@react-three/postprocessing"
import * as THREE from "three"

/**
 * The hero's WebGL layer (DESIGN "Hero 3D direction"): curved glass fiber
 * strands converging from the left into one node and fanning out to the right, each with an emissive cyan core
 * and light pulses travelling along it. Loaded only via `next/dynamic`
 * ({ ssr: false }) from `FiberBackdrop`, so three.js stays out of the initial
 * bundle (hard rule #8). Never mounted under reduced motion — the poster is the
 * static alternative. `<PerformanceMonitor>` drops bloom and pulses on low FPS.
 */

const CORE_COLOR = "#22d3ee"
const PULSE_COLOR = "#a5f3fc"
const PULSES_PER_STRAND = 3
/** Where the bundle pinches (world units): right of the headline on desktop, under the copy on phones. */
const NODES = { desktop: [1.7, 0.3], mobile: [0.3, -1.9] } as const

function Strands({
  strands,
  interactive,
  showPulses,
  node: NODE,
}: {
  strands: number
  interactive: boolean
  showPulses: boolean
  node: readonly [number, number]
}) {
  const group = useRef<THREE.Group>(null)
  const pulses = useRef<THREE.InstancedMesh>(null)
  const boost = useRef(0)
  const prevPointer = useRef(new THREE.Vector2())
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  // Bow-tie bundle: strands run in from the left edge (the network), pinch
  // through one bright node to the right of the headline (GigaFazt), then fan
  // out toward the right edge (the homes). Light flows left → right.
  const curves = useMemo(
    () =>
      Array.from({ length: strands }, (_, i) => {
        const t = strands === 1 ? 0.5 : i / (strands - 1)
        const s = (t - 0.5) * 2 // -1..1
        const z = Math.cos(t * Math.PI) * 0.9
        const [nx, ny] = NODE
        return new THREE.CatmullRomCurve3([
          new THREE.Vector3(-6.4, ny + s * 2.9 - 0.4, -0.8 * z),
          new THREE.Vector3(-3.2, ny + s * 1.5 - 0.15, -0.3 * z),
          new THREE.Vector3(nx - 1.3, ny + s * 0.22, 0),
          new THREE.Vector3(nx, ny + s * 0.03, 0),
          new THREE.Vector3(nx + 1.2, ny + s * 0.35, z * 0.4),
          new THREE.Vector3(nx + 2.8, ny + s * 1.6 - 0.2, z * 0.8),
          new THREE.Vector3(6.6, s * 2.6 - 0.1, z * 0.3),
        ])
      }),
    [strands, NODE]
  )

  const shellGeos = useMemo(
    () => curves.map((c) => new THREE.TubeGeometry(c, 128, 0.028, 8, false)),
    [curves]
  )
  const coreGeos = useMemo(
    () => curves.map((c) => new THREE.TubeGeometry(c, 128, 0.008, 6, false)),
    [curves]
  )

  const count = strands * PULSES_PER_STRAND
  const pulseGeo = useMemo(() => new THREE.CapsuleGeometry(0.028, 0.13, 4, 8), [])
  const pulseMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: PULSE_COLOR, toneMapped: false }),
    []
  )
  const offsets = useMemo(
    () =>
      Array.from(
        { length: count },
        (_, i) => (i % PULSES_PER_STRAND) / PULSES_PER_STRAND + (i * 0.013) % 0.2
      ),
    [count]
  )

  useFrame((state, delta) => {
    const g = group.current
    if (g && interactive) {
      // Bundle eases toward the pointer (spring, ≤ ~4°).
      const { x: px, y: py } = state.pointer
      const k = Math.min(1, delta * 3)
      g.rotation.y += (px * 0.07 - g.rotation.y) * k
      g.rotation.x += (-py * 0.05 - g.rotation.x) * k
      const moved =
        Math.abs(px - prevPointer.current.x) + Math.abs(py - prevPointer.current.y)
      if (moved > 0.002) boost.current = 1
      prevPointer.current.set(px, py)
    }
    boost.current = Math.max(0, boost.current - delta * 0.8)

    const inst = pulses.current
    if (!inst) return
    // Pulses travel along the curves; cursor activity speeds them up ~1.5×.
    const speed = 0.11 * (1 + boost.current * 0.5)
    const t = state.clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const curve = curves[Math.floor(i / PULSES_PER_STRAND)]
      const u = (offsets[i] + t * speed) % 1
      curve.getPointAt(u, dummy.position)
      const tan = curve.getTangentAt(u).normalize()
      dummy.quaternion.setFromUnitVectors(up, tan)
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
    }
    inst.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={group}>
      {shellGeos.map((geo, i) => (
        <mesh key={`s${i}`} geometry={geo}>
          <meshStandardMaterial
            color="#0e7490"
            transparent
            opacity={0.14}
            roughness={0.25}
            metalness={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
      {coreGeos.map((geo, i) => (
        <mesh key={`c${i}`} geometry={geo}>
          <meshBasicMaterial color={CORE_COLOR} toneMapped={false} />
        </mesh>
      ))}

      {showPulses && (
        <instancedMesh
          key={count}
          ref={pulses}
          args={[pulseGeo, pulseMat, count]}
        />
      )}

      {/* The bundle node. */}
      <mesh position={[NODE[0], NODE[1], 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color="#ecfeff" toneMapped={false} />
      </mesh>
    </group>
  )
}

export function FiberScene({
  interactive,
  quality,
  onReady,
}: {
  interactive: boolean
  quality: "mobile" | "desktop"
  onReady?: () => void
}) {
  const [bloom, setBloom] = useState(true)
  const [showPulses, setShowPulses] = useState(true)
  const strands = quality === "mobile" ? 8 : 12

  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, quality === "mobile" ? 1.25 : 1.75]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 7], fov: 44 }}
      onCreated={({ gl }) => {
        gl.setClearAlpha(0)
        requestAnimationFrame(() => onReady?.())
      }}
    >
      <PerformanceMonitor
        onDecline={() => {
          setBloom(false)
          setShowPulses(false)
        }}
      />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} color="#67e8f9" />
      <pointLight position={[NODES[quality][0], NODES[quality][1], 2]} intensity={6} distance={14} color={CORE_COLOR} />
      <Strands strands={strands} interactive={interactive} showPulses={showPulses} node={NODES[quality]} />
      {bloom && (
        <EffectComposer>
          <Bloom luminanceThreshold={0.35} intensity={1.1} radius={0.7} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  )
}
