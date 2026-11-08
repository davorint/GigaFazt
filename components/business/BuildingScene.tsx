"use client"

import { useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Grid, PerformanceMonitor } from "@react-three/drei"
import { Bloom, EffectComposer } from "@react-three/postprocessing"

/**
 * /empresas hero object (owner, 2026-11-08: "super expensive, hyper high
 * profile"): the page's isometric building schematic (IsoBuilding) as a live
 * 3D model. Four glass floor plates over a blueprint floor; fiber enters from
 * the street, the riser draws itself upward, then each floor lights up in turn
 * (branches, then the connected areas), and light packets keep climbing the
 * riser and running one branch per floor. Slow turn + cursor follow.
 *
 * Unbranded, illustrative (captioned "Ilustración" by the wrapper). Only
 * unlit (basic) materials: the light is the fiber itself, bloomed (DESIGN.md:
 * postprocessing for bloom only). `still` = the finished, fully lit frame in
 * one render (reduced motion / paused). `quality: "low"` drops bloom.
 */

const BG = "#060608"
const VIOLET = new THREE.Color("#a78bfa")
const LILAC = new THREE.Color("#c4b5fd")
const WHITE = new THREE.Color("#ffffff")

const W = 2.6
const D = 1.8
const LEVELS = [0, 0.75, 1.5, 2.25]
const TOP = LEVELS[LEVELS.length - 1]
const ENTRY_Y = -0.38
const STREET_Z = 2.6
const RISER_H = TOP + 0.16 - ENTRY_Y
const T = { entry: 0.2, riser: 0.7, level0: 1.4, levelGap: 0.55, ramp: 0.6, intro: 2.4 }

/** Connected areas per level, in IsoBuilding's plan units (260 × 180). */
const PLAN_NODES: [number, number][][] = [
  [[34, 30], [226, 30], [34, 150], [226, 150]],
  [[30, 90], [230, 40], [230, 140], [130, 160]],
  [[40, 40], [220, 40], [40, 150], [220, 150], [130, 20]],
  [[50, 30], [210, 30], [130, 160]],
]
const NODES = PLAN_NODES.map((lvl) => lvl.map(([x, y]) => [(x / 260 - 0.5) * W, (y / 180 - 0.5) * D] as const))

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const levelOn = (t: number, i: number) => easeOut((t - (T.level0 + i * T.levelGap)) / T.ramp)

function setGlow(m: THREE.MeshBasicMaterial, base: THREE.Color, k: number) {
  m.color.copy(base).multiplyScalar(k)
}

type LevelMats = { branch: THREE.MeshBasicMaterial; node: THREE.MeshBasicMaterial; plate: THREE.MeshBasicMaterial; edge: THREE.LineBasicMaterial }

function useLevelMats(): LevelMats[] {
  return useMemo(
    () =>
      LEVELS.map(() => ({
        branch: new THREE.MeshBasicMaterial({ toneMapped: false }),
        node: new THREE.MeshBasicMaterial({ toneMapped: false }),
        plate: new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.02, depthWrite: false, side: THREE.DoubleSide }),
        edge: new THREE.LineBasicMaterial({ color: WHITE, transparent: true, opacity: 0.18 }),
      })),
    []
  )
}

/** A thin bar from a to b (axis-aligned segments only). */
function Bar({ a, b, material, r = 0.012 }: { a: [number, number, number]; b: [number, number, number]; material: THREE.Material; r?: number }) {
  const size: [number, number, number] = [Math.abs(b[0] - a[0]) || r, Math.abs(b[1] - a[1]) || r, Math.abs(b[2] - a[2]) || r]
  const pos: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  return (
    <mesh position={pos} material={material}>
      <boxGeometry args={size} />
    </mesh>
  )
}

function Building({ still, interactive, clockRef }: { still: boolean; interactive: boolean; clockRef: React.RefObject<number> }) {
  const mats = useLevelMats()
  const riserMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), [])
  const packetMat = useMemo(() => new THREE.MeshBasicMaterial({ color: WHITE.clone().multiplyScalar(4), toneMapped: false }), [])
  const plateGeo = useMemo(() => new THREE.BoxGeometry(W, 0.018, D), [])
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(plateGeo), [plateGeo])
  const riserGeo = useMemo(() => new THREE.BoxGeometry(0.03, RISER_H, 0.03).translate(0, RISER_H / 2, 0), [])
  const riser = useRef<THREE.Mesh>(null)
  const entry = useRef<THREE.Mesh>(null)
  const turn = useRef<THREE.Group>(null)
  const riserPackets = useRef<(THREE.Mesh | null)[]>([])
  const branchPackets = useRef<(THREE.Mesh | null)[]>([])
  const { pointer } = useThree()

  useFrame((_, dt) => {
    const t = clockRef.current
    const step = Math.min(dt, 0.1)

    // Street entry, then the riser drawing itself upward.
    const e = still ? 1 : easeOut((t - T.entry) / 0.6)
    if (entry.current) {
      entry.current.scale.z = Math.max(0.001, e)
      entry.current.position.z = STREET_Z * (1 - e / 2)
    }
    const r = still ? 1 : easeOut((t - T.riser) / 0.9)
    if (riser.current) riser.current.scale.y = Math.max(0.001, r)
    setGlow(riserMat, VIOLET, 0.6 + 1.6 * r)

    // Floors light up one by one, then breathe gently.
    LEVELS.forEach((_, i) => {
      const on = still ? 1 : levelOn(t, i)
      const breathe = still ? 1 : 1 + 0.12 * Math.sin(t * 1.3 - i * 0.9)
      setGlow(mats[i].branch, LILAC, (0.12 + 1.4 * on) * breathe)
      setGlow(mats[i].node, WHITE, (0.15 + 1.9 * on) * breathe)
      mats[i].plate.opacity = 0.02 + 0.045 * on
      mats[i].edge.opacity = 0.14 + 0.36 * on
    })

    // Packets: two climb the riser; one runs a branch per lit floor.
    riserPackets.current.forEach((m, k) => {
      if (!m) return
      const p = ((t - 1.2 + k * 1.2) / 2.4) % 1
      m.visible = !still && t > 1.2 + k * 1.2
      m.position.set(0, ENTRY_Y + p * (TOP - ENTRY_Y), 0)
    })
    branchPackets.current.forEach((m, i) => {
      if (!m) return
      const [nx, nz] = NODES[i][1]
      const start = T.level0 + i * T.levelGap + T.ramp
      const p = ((t - start - i * 0.45) / 1.8) % 1
      m.visible = !still && t > start + i * 0.45
      const lx = Math.abs(nx)
      const lz = Math.abs(nz)
      const d = p * (lx + lz)
      m.position.set(d < lx ? Math.sign(nx) * d : nx, LEVELS[i] + 0.02, d < lx ? 0 : Math.sign(nz) * (d - lx))
    })

    const g = turn.current
    if (g) {
      const target = still ? -0.62 : -0.62 + Math.sin(t * 0.16) * 0.14 + (interactive ? pointer.x * 0.2 : 0)
      g.rotation.y = still ? target : g.rotation.y + (target - g.rotation.y) * (1 - Math.exp(-step * 2))
    }
  })

  return (
    <group ref={turn} position={[0, -0.9, 0]}>
      {/* Building envelope: faint vertical corners. */}
      {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => (
        <mesh key={`${sx}${sz}`} position={[(sx * W) / 2, TOP / 2, (sz * D) / 2]}>
          <boxGeometry args={[0.004, TOP, 0.004]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.12} />
        </mesh>
      ))}

      {LEVELS.map((y, i) => (
        <group key={y} position={[0, y, 0]}>
          <mesh geometry={plateGeo} material={mats[i].plate} />
          <lineSegments geometry={edgeGeo} material={mats[i].edge} />
          {NODES[i].map(([nx, nz], j) => (
            <group key={j}>
              <Bar a={[0, 0.02, 0]} b={[nx, 0.02, 0]} material={mats[i].branch} />
              <Bar a={[nx, 0.02, 0]} b={[nx, 0.02, nz]} material={mats[i].branch} />
              <mesh position={[nx, 0.045, nz]} material={mats[i].node}>
                <boxGeometry args={[0.1, 0.05, 0.1]} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.02, 0]} material={mats[i].node}>
            <sphereGeometry args={[0.04, 16, 12]} />
          </mesh>
        </group>
      ))}

      {/* Street → service entrance (grows toward the building), then the riser. */}
      <mesh ref={entry} position={[0, ENTRY_Y, STREET_Z / 2]} material={riserMat}>
        <boxGeometry args={[0.03, 0.03, STREET_Z]} />
      </mesh>
      <mesh ref={riser} position={[0, ENTRY_Y, 0]} geometry={riserGeo} material={riserMat} />

      {[0, 1].map((k) => (
        <mesh key={`r${k}`} ref={(m) => { riserPackets.current[k] = m }} material={packetMat} visible={false}>
          <sphereGeometry args={[0.03, 12, 8]} />
        </mesh>
      ))}
      {LEVELS.map((_, i) => (
        <mesh key={`b${i}`} ref={(m) => { branchPackets.current[i] = m }} material={packetMat} visible={false}>
          <sphereGeometry args={[0.024, 12, 8]} />
        </mesh>
      ))}
    </group>
  )
}

/** Camera: eases in from wide during the intro; pulls back on narrow boxes. */
function Rig({ still, interactive, clockRef }: { still: boolean; interactive: boolean; clockRef: React.RefObject<number> }) {
  const { pointer, invalidate } = useThree()
  const settle = useRef(0)
  useFrame(({ camera, size }, dt) => {
    clockRef.current = still ? 99 : clockRef.current + Math.min(dt, 0.5)
    const fit = Math.max(1, 1.05 / (size.width / size.height))
    const e = still ? 1 : easeOut(clockRef.current / T.intro)
    const dist = (8.6 - 1.6 * e) * fit
    camera.position.set(0, 3.3 + 0.9 * (1 - e) + (interactive && !still ? pointer.y * 0.15 : 0), dist)
    camera.lookAt(0, 0.35, 0)
    if (still && settle.current < 2) {
      settle.current++
      invalidate()
    }
  })
  return null
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

export default function BuildingScene({
  still,
  interactive,
  active,
  quality = "high",
  onReady,
}: {
  still: boolean
  interactive: boolean
  /** On screen: animate; off screen: hold the last frame. */
  active: boolean
  quality?: "high" | "low"
  onReady?: () => void
}) {
  const [fx, setFx] = useState(quality === "high")
  const clockRef = useRef(0)

  return (
    <Canvas
      dpr={[1, quality === "high" ? 1.75 : 1.25]}
      frameloop={still || !active ? "demand" : "always"}
      camera={{ position: [0, 3.3, 7], fov: 28 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      {quality === "high" && <PerformanceMonitor onDecline={() => setFx(false)} />}
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 7, 14]} />
      <Rig still={still} interactive={interactive} clockRef={clockRef} />
      <Building still={still} interactive={interactive} clockRef={clockRef} />
      <Grid
        position={[0, -0.9 + ENTRY_Y - 0.02, 0]}
        args={[16, 16]}
        cellSize={0.32}
        cellThickness={0.6}
        cellColor="#1c1b24"
        sectionSize={1.6}
        sectionThickness={1}
        sectionColor="#3b3160"
        fadeDistance={11}
        fadeStrength={1.6}
        infiniteGrid
      />
      {fx && (
        <EffectComposer multisampling={4}>
          <Bloom luminanceThreshold={0.42} luminanceSmoothing={0.3} intensity={1.15} radius={0.72} mipmapBlur />
        </EffectComposer>
      )}
      <Ready onReady={onReady} />
    </Canvas>
  )
}
