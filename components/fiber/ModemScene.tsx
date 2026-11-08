"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { ContactShadows, Environment, Lightformer, RoundedBox } from "@react-three/drei"

/**
 * Product render of the plan's Wi-Fi 7 modem (owner, 2026-11-08: "hyper
 * expensive" point 7: one real object among the abstract light). An
 * unbranded, generic standing modem, labeled "Ilustración" by its wrapper:
 * it is not the exact product. Satin white body, top vents, a cyan status
 * line, Wi-Fi rings spreading out on the floor; studio light from local
 * Lightformers (no HDR download), a baked contact shadow. Turns slowly and
 * follows the cursor; `still` = one frame (reduced motion / paused).
 */

const BODY = { w: 0.62, h: 1.05, d: 0.22 }
const RINGS = 3
const RING_PERIOD = 3.2

function Vents() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const cols = 11
  const rows = 1
  useEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    let i = 0
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        o.position.set((c - (cols - 1) / 2) * 0.042, BODY.h / 2 + 0.001, (r - (rows - 1) / 2) * 0.05)
        o.updateMatrix()
        m.setMatrixAt(i++, o.matrix)
      }
    m.instanceMatrix.needsUpdate = true
  }, [])
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, cols * rows]}>
      <boxGeometry args={[0.016, 0.004, 0.13]} />
      <meshStandardMaterial color="#0d0f13" roughness={0.9} />
    </instancedMesh>
  )
}

function Rings({ still }: { still: boolean }) {
  const group = useRef<THREE.Group>(null)
  const geom = useMemo(() => new THREE.RingGeometry(0.98, 1, 96), [])
  useEffect(() => () => geom.dispose(), [geom])
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const t = still ? 1.1 : clock.elapsedTime
    g.children.forEach((child, i) => {
      const p = ((t / RING_PERIOD + i / RINGS) % 1 + 1) % 1
      const s = 0.45 + p * 1.9
      child.scale.set(s, s, s)
      ;((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - p) * Math.min(1, p * 6)
    })
  })
  return (
    <group ref={group} rotation={[-Math.PI / 2, 0, 0]} position={[0, -BODY.h / 2 - 0.059, 0]}>
      {Array.from({ length: RINGS }, (_, i) => (
        <mesh key={i} geometry={geom}>
          <meshBasicMaterial color="#67e8f9" transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function Modem({ still, interactive }: { still: boolean; interactive: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const led = useRef<THREE.MeshBasicMaterial>(null)
  const { pointer } = useThree()
  useFrame(({ clock }, dt) => {
    const g = ref.current
    if (!g) return
    if (still) {
      g.rotation.set(0, -0.55, 0)
      return
    }
    const t = clock.elapsedTime
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 3)
    const targetY = -0.55 + Math.sin(t * 0.25) * 0.5 + (interactive ? pointer.x * 0.35 : 0)
    const targetX = interactive ? -pointer.y * 0.12 : 0
    g.rotation.y += (targetY - g.rotation.y) * k
    g.rotation.x += (targetX - g.rotation.x) * k
    g.position.y = Math.sin(t * 0.8) * 0.012
    if (led.current) led.current.color.setRGB(0.35, 0.85 + Math.sin(t * 2) * 0.12, 1).multiplyScalar(1.6)
  })
  return (
    <group ref={ref}>
      {/* Body: satin white, a little clearcoat for the studio highlights. */}
      <RoundedBox args={[BODY.w, BODY.h, BODY.d]} radius={0.075} smoothness={6}>
        <meshPhysicalMaterial color="#e4e8ee" roughness={0.34} metalness={0} clearcoat={0.85} clearcoatRoughness={0.18} sheen={0.4} sheenColor="#cfefff" />
      </RoundedBox>
      {/* A fine seam that wraps the body a third of the way down. */}
      <mesh position={[0, BODY.h * 0.18, BODY.d / 2 + 0.0012]}>
        <planeGeometry args={[BODY.w - 0.12, 0.0035]} />
        <meshStandardMaterial color="#9aa3ae" roughness={0.6} />
      </mesh>
      {/* Satin dark band at the base of the front, where the status light sits. */}
      <mesh position={[0, -BODY.h / 2 + 0.16, BODY.d / 2 + 0.001]}>
        <planeGeometry args={[0.3, 0.05]} />
        <meshStandardMaterial color="#1b1f26" roughness={0.35} metalness={0.3} />
      </mesh>
      <Vents />
      {/* Status line on the front, near the base. */}
      <mesh position={[0, -BODY.h / 2 + 0.16, BODY.d / 2 + 0.002]}>
        <planeGeometry args={[0.16, 0.008]} />
        <meshBasicMaterial ref={led} color={new THREE.Color(0.56, 1.5, 1.6)} toneMapped={false} />
      </mesh>
      {/* Plinth. */}
      <RoundedBox args={[BODY.w * 0.86, 0.05, BODY.d * 1.5]} radius={0.02} smoothness={4} position={[0, -BODY.h / 2 - 0.03, 0]}>
        <meshStandardMaterial color="#14171c" roughness={0.45} metalness={0.4} />
      </RoundedBox>
    </group>
  )
}

function Ready({ onReady }: { onReady?: () => void }) {
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    requestAnimationFrame(() => onReady?.())
  })
  return null
}

export default function ModemScene({
  still,
  interactive,
  active,
  onReady,
}: {
  still: boolean
  interactive: boolean
  /** On screen: animate; off screen: hold the last frame. */
  active: boolean
  onReady?: () => void
}) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={still || !active ? "demand" : "always"}
      camera={{ position: [0, 0.95, 3.0], fov: 30 }}
      onCreated={({ camera }) => camera.lookAt(0, -0.08, 0)}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
    >
      <ambientLight intensity={0.12} />
      {/* Key from the front left, so the front face falls off across its width. */}
      <directionalLight position={[-3, 2.2, 1.2]} intensity={1.15} />
      <directionalLight position={[2.5, 0.6, -2]} intensity={0.6} color="#a78bfa" />
      <Environment resolution={256} frames={1}>
        {/* Studio: a big soft key, a cool cyan rim and a violet kicker. */}
        <Lightformer form="rect" intensity={1.1} color="#ffffff" position={[-1.5, 3, 1.5]} scale={[3, 1.5, 1]} />
        <Lightformer form="rect" intensity={3} color="#67e8f9" position={[-3, 0.5, -0.5]} rotation={[0, Math.PI / 2, 0]} scale={[3, 0.6, 1]} />
        <Lightformer form="rect" intensity={2.4} color="#a78bfa" position={[3, 0.2, -0.5]} rotation={[0, -Math.PI / 2, 0]} scale={[3, 0.6, 1]} />
        <Lightformer form="ring" intensity={0.35} color="#ffffff" position={[0, 0.5, 4]} scale={2} />
      </Environment>
      <group position={[0, 0.02, 0]}>
        <Modem still={still} interactive={interactive} />
        <Rings still={still} />
        <ContactShadows position={[0, -BODY.h / 2 - 0.058, 0]} opacity={0.65} scale={2.4} blur={2.6} far={1.2} frames={1} color="#000000" />
      </group>
      <Ready onReady={onReady} />
    </Canvas>
  )
}
