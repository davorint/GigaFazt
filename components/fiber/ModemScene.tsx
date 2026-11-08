"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import {
  ContactShadows,
  Environment,
  Html,
  Lightformer,
  MeshReflectorMaterial,
  PerformanceMonitor,
  RoundedBox,
} from "@react-three/drei"
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing"
import { ToneMappingMode } from "postprocessing"

/**
 * Studio product shot of the 1 Gbps plan's Wi-Fi 7 modem (owner, 2026-11-08:
 * "truly spectacular, hyper expensive"), modeled on the actual unit
 * (BUSINESS.md: Huawei OptiXstar EG8145B7N-50, 150 × 108 × 40 mm): a flat
 * white box whose beveled lid overhangs a louvered lower body, two tapered
 * blade antennas on hinge ears at the back corners, status LEDs set into the
 * lid. No logo or brand (BUSINESS.md). Captioned "Ilustración" by its wrapper.
 *
 * Staging: a reflective studio floor that fades into the page (CSS mask on
 * the wrapper), a spotlight pool, a cyan halo set into the floor, soft live
 * contact shadows, bloom on emissive light only (DESIGN.md: bloom only).
 *
 * Sequence on first view: the camera eases in, a light sweeps across the lid,
 * the LEDs boot (power → PON blinking then steady → Wi-Fi 2.4 → Wi-Fi 5), then
 * Wi-Fi wavefronts radiate and the spec callouts appear. Scroll turns the
 * modem; the cursor nudges it. `still` renders the finished state in one frame
 * (reduced motion / paused). `quality: "low"` (phones, slow GPUs) drops the
 * reflector, bloom, live shadows and callouts.
 */

// ── Dimensions (scene units; 1 mm of the real unit = MM) ───────────────────
const MM = 0.006
const BODY = { w: 150 * MM, h: 40 * MM, d: 108 * MM }
const LID_H = 0.062
const INSET = 0.028
const LOWER_H = BODY.h - LID_H
const LOWER_Y = -BODY.h / 2 + LOWER_H / 2
const ANTENNA = { w: 12 * MM, h: 158 * MM, t: 5 * MM }
const FLOOR_Y = -BODY.h / 2
const HINGE_Y = LOWER_Y
const ANTENNA_Z = -BODY.d / 2 + 0.075
const ANTENNA_X = BODY.w / 2 + ANTENNA.w / 2 + 0.004
const HALO_R = 0.78
/** Studio backdrop: matches the page so the wrapper's feathered mask blends it in. */
const BG = "#04070d"

/** Sequence times (s) from the first visible frame. */
const T = { power: 0.7, ponStart: 1.0, ponSteady: 1.9, wifi24: 2.25, wifi5: 2.45, waves: 2.6, callouts: 3.0, intro: 2.2 }
const WAVE_PERIOD = 3.6
const WAVES = 3

const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x))
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Phase (0–1) of wave `i` of `WAVES`, `t` s after the waves start; null before it is born. */
function wavePhase(t: number, i: number): number | null {
  const start = (i / WAVES) * WAVE_PERIOD
  if (t < start) return null
  return ((t - start) / WAVE_PERIOD) % 1
}

// Area lights (the intro's light sweep) need their uniforms registered once,
// before any material compiles. This module only ever loads in the browser
// (next/dynamic, ssr: false), so module scope is the right place.
RectAreaLightUniformsLib.init()

export type ModemCallouts = { antennas: string; mlo: string; speed: string }

// ── Materials ──────────────────────────────────────────────────────────────

type Mats = { white: THREE.MeshPhysicalMaterial; shade: THREE.MeshPhysicalMaterial }
const MatsContext = createContext<Mats | null>(null)
function useMats(): Mats {
  const m = useContext(MatsContext)
  if (!m) throw new Error("useMats outside <Body>")
  return m
}

/** Satin white plastic with a faint micro texture in its roughness. */
function useWhitePlastic(): Mats {
  const mats = useMemo(() => {
    const c = document.createElement("canvas")
    c.width = c.height = 128
    const ctx = c.getContext("2d")!
    const img = ctx.createImageData(128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      // Deterministic hash noise (pure: same texture every render).
      const h = Math.sin(i * 12.9898) * 43758.5453
      const v = 138 + (h - Math.floor(h)) * 28
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(6, 6)
    const white = new THREE.MeshPhysicalMaterial({
      color: "#f3f5f8",
      roughness: 0.62,
      roughnessMap: tex,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      sheen: 0.35,
      sheenColor: new THREE.Color("#dff6ff"),
      sheenRoughness: 0.6,
    })
    const shade = white.clone()
    shade.color = new THREE.Color("#e6e9ee")
    shade.clearcoat = 0.25
    return { white, shade, tex }
  }, [])
  useEffect(
    () => () => {
      mats.white.dispose()
      mats.shade.dispose()
      mats.tex.dispose()
    },
    [mats]
  )
  return mats
}

// ── Geometry helpers ───────────────────────────────────────────────────────

function roundedRect(w: number, d: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -d / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + d - r)
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
  s.lineTo(x + r, y + d)
  s.quadraticCurveTo(x, y + d, x, y + d - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/** A horizontal slab with crisp beveled edges (catches thin highlights). */
function useSlab(w: number, d: number, h: number, r: number, bevel: number) {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(roundedRect(w - bevel * 2, d - bevel * 2, r), {
      depth: Math.max(0.001, h - bevel * 2),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 6,
      curveSegments: 20,
    })
    g.rotateX(-Math.PI / 2)
    g.center()
    g.computeVertexNormals()
    return g
  }, [w, d, h, r, bevel])
  useEffect(() => () => geo.dispose(), [geo])
  return geo
}

/** A blade antenna profile: slightly tapered, with a rounded tip. */
function useBlade() {
  const geo = useMemo(() => {
    const w0 = ANTENNA.w / 2 - 0.006
    const w1 = w0 * 0.82
    const h = ANTENNA.h
    const s = new THREE.Shape()
    s.moveTo(-w0, 0)
    s.lineTo(w0, 0)
    s.lineTo(w1, h - w1)
    s.quadraticCurveTo(w1, h, 0, h)
    s.quadraticCurveTo(-w1, h, -w1, h - w1)
    s.lineTo(-w0, 0)
    const bevel = 0.007
    const g = new THREE.ExtrudeGeometry(s, {
      depth: ANTENNA.t - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 5,
      curveSegments: 16,
    })
    g.translate(0, 0, -(ANTENNA.t - bevel * 2) / 2)
    g.computeVertexNormals()
    return g
  }, [])
  useEffect(() => () => geo.dispose(), [geo])
  return geo
}

// ── The modem ──────────────────────────────────────────────────────────────

/** Angled louvers on one face, over a dark core (real depth between slats). */
function Louvers({ length, axis, offset, center = 0 }: { length: number; axis: "x" | "z"; offset: number; center?: number }) {
  const { white } = useMats()
  const n = 7
  const top = LOWER_Y + LOWER_H / 2 - 0.016
  const bottom = LOWER_Y - LOWER_H / 2 + 0.03
  const pitch = (top - bottom) / n
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const y = bottom + pitch * (i + 0.5)
        return axis === "z" ? (
          <mesh key={i} material={white} position={[center, y, offset]} rotation={[0.55 * Math.sign(offset), 0, 0]}>
            <boxGeometry args={[length, pitch * 0.55, 0.02]} />
          </mesh>
        ) : (
          <mesh key={i} material={white} position={[offset, y, center]} rotation={[0, 0, -0.55 * Math.sign(offset)]}>
            <boxGeometry args={[0.02, pitch * 0.55, length]} />
          </mesh>
        )
      })}
    </group>
  )
}

/** Blade on a knuckle, on an ear molded into the deep back corner post. */
function Antenna({ side }: { side: 1 | -1 }) {
  const { shade, white } = useMats()
  const blade = useBlade()
  const bodySide = BODY.w / 2 - INSET
  const earLen = ANTENNA_X - bodySide + 0.014
  return (
    <group>
      <RoundedBox
        args={[earLen, 0.075, 0.08]}
        radius={0.016}
        smoothness={4}
        position={[side * (bodySide - 0.014 + earLen / 2), HINGE_Y, ANTENNA_Z]}
        material={shade}
      />
      <group position={[side * ANTENNA_X, HINGE_Y, ANTENNA_Z]} rotation={[0, 0, -side * 0.05]}>
        <mesh rotation={[0, 0, Math.PI / 2]} material={shade}>
          <cylinderGeometry args={[0.031, 0.031, ANTENNA.w + 0.004, 40]} />
        </mesh>
        <mesh geometry={blade} material={white} position={[0, -0.005, 0]} />
      </group>
    </group>
  )
}

function Body() {
  const mats = useWhitePlastic()
  const lid = useSlab(BODY.w, BODY.d, LID_H, 0.05, 0.014)
  const base = useSlab(BODY.w - INSET * 2, BODY.d - INSET * 2, 0.03, 0.035, 0.008)
  const fw = BODY.w / 2 - INSET
  const fd = BODY.d / 2 - INSET
  const sideLen = BODY.d - INSET * 2 - 0.2
  return (
    <MatsContext.Provider value={mats}>
      <mesh geometry={lid} material={mats.white} position={[0, BODY.h / 2 - LID_H / 2, 0]} />
      {/* Dark core seen between the louvers. */}
      <mesh position={[0, LOWER_Y + 0.004, 0]}>
        <boxGeometry args={[BODY.w - INSET * 2 - 0.05, LOWER_H - 0.01, BODY.d - INSET * 2 - 0.05]} />
        <meshStandardMaterial color="#14171c" roughness={0.9} />
      </mesh>
      <mesh geometry={base} material={mats.shade} position={[0, -BODY.h / 2 + 0.015, 0]} />
      {/* Corner posts: slim at the front, deep at the back (the antenna mounts). */}
      {([1, -1] as const).map((sx) => (
        <group key={sx}>
          <RoundedBox args={[0.045, LOWER_H, 0.045]} radius={0.012} smoothness={3} position={[sx * (fw - 0.0225), LOWER_Y, fd - 0.0225]} material={mats.shade} />
          <RoundedBox args={[0.05, LOWER_H, 0.17]} radius={0.012} smoothness={3} position={[sx * (fw - 0.025), LOWER_Y, -fd + 0.085]} material={mats.shade} />
        </group>
      ))}
      {/* Back panel. */}
      <mesh position={[0, LOWER_Y, -fd + 0.006]} material={mats.shade}>
        <boxGeometry args={[BODY.w - INSET * 2 - 0.08, LOWER_H, 0.012]} />
      </mesh>
      <Louvers axis="z" offset={fd - 0.008} length={BODY.w - INSET * 2 - 0.09} />
      <Louvers axis="x" offset={fw - 0.008} length={sideLen} center={0.06} />
      <Louvers axis="x" offset={-(fw - 0.008)} length={sideLen} center={0.06} />
      <Antenna side={1} />
      <Antenna side={-1} />
    </MatsContext.Provider>
  )
}

/** LED lenses set into the lid; the lit ones (power, PON, 2.4 GHz, 5 GHz) boot in order. */
const LED_COUNT = 8
const LIT: Record<number, "power" | "ponStart" | "wifi24" | "wifi5"> = { 0: "power", 1: "ponStart", 5: "wifi24", 6: "wifi5" }
function Leds({ clockRef }: { clockRef: React.RefObject<number> }) {
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([])
  const glow = useMemo(() => new THREE.Color(0.9, 3.4, 3.8), [])
  useFrame(() => {
    const t = clockRef.current
    for (const [k, key] of Object.entries(LIT)) {
      const m = mats.current[+k]
      if (!m) continue
      let on = t >= T[key]
      if (key === "ponStart" && t < T.ponSteady) on = t >= T.ponStart && Math.floor((t - T.ponStart) * 6) % 2 === 0
      const breathe = key === "wifi5" || key === "wifi24" ? 0.85 + Math.sin(t * 2.2 + +k) * 0.15 : 1
      m.opacity = on ? 1 : 0
      m.color.copy(glow).multiplyScalar(breathe)
    }
  })
  const y = BODY.h / 2 + 0.0008
  const z = BODY.d / 2 - 0.075
  return (
    <group>
      {Array.from({ length: LED_COUNT }, (_, i) => {
        const x = (i - (LED_COUNT - 1) / 2) * 0.052
        return (
          <group key={i} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh>
              <planeGeometry args={[0.024, 0.009]} />
              <meshStandardMaterial color="#9aa2ad" roughness={0.4} />
            </mesh>
            {i in LIT && (
              <mesh position={[0, 0, 0.0006]}>
                <planeGeometry args={[0.024, 0.009]} />
                <meshBasicMaterial
                  ref={(m) => {
                    mats.current[i] = m
                  }}
                  transparent
                  opacity={0}
                  toneMapped={false}
                />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

// ── Light and signal ───────────────────────────────────────────────────────

const shellVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const shellFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float f = pow(1.0 - abs(dot(vN, vV)), 5.0);
    gl_FragColor = vec4(uColor * f * uOpacity, 1.0);
    #include <colorspace_fragment>
  }
`

/** Wi-Fi wavefronts: thin fresnel shells expanding from the antennas. */
function Wavefronts({ clockRef }: { clockRef: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null)
  const geo = useMemo(() => new THREE.SphereGeometry(1, 64, 32), [])
  const mats = useMemo(
    () =>
      Array.from(
        { length: WAVES },
        () =>
          new THREE.ShaderMaterial({
            vertexShader: shellVert,
            fragmentShader: shellFrag,
            uniforms: { uColor: { value: new THREE.Color(0.35, 1.6, 1.9) }, uOpacity: { value: 0 } },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          })
      ),
    []
  )
  useEffect(
    () => () => {
      geo.dispose()
      mats.forEach((m) => m.dispose())
    },
    [geo, mats]
  )
  useFrame(() => {
    const t = clockRef.current - T.waves
    group.current?.children.forEach((c, i) => {
      const p = wavePhase(t, i)
      if (p === null) return void (mats[i].uniforms.uOpacity.value = 0)
      const s = 0.35 + p * 2.6
      c.scale.set(s, s * 0.82, s)
      mats[i].uniforms.uOpacity.value = 0.55 * Math.min(1, p * 5) * Math.pow(1 - p, 2)
    })
  })
  return (
    <group ref={group} position={[0, 0.3, ANTENNA_Z * 0.6]}>
      {mats.map((m, i) => (
        <mesh key={i} geometry={geo} material={m} />
      ))}
    </group>
  )
}

/** The halo set into the floor, its light pool, and ripples echoing the wavefronts. */
function FloorLight({ clockRef, ripples }: { clockRef: React.RefObject<number>; ripples: boolean }) {
  const rings = useRef<THREE.Group>(null)
  const halo = useRef<THREE.MeshBasicMaterial>(null)
  const pool = useRef<THREE.MeshBasicMaterial>(null)
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.985, 1, 128), [])
  const poolTex = useMemo(() => {
    const c = document.createElement("canvas")
    c.width = c.height = 128
    const ctx = c.getContext("2d")!
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, "rgba(103,232,249,0.5)")
    g.addColorStop(0.45, "rgba(34,211,238,0.16)")
    g.addColorStop(1, "rgba(34,211,238,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  }, [])
  useEffect(
    () => () => {
      ringGeo.dispose()
      poolTex.dispose()
    },
    [ringGeo, poolTex]
  )
  useFrame(() => {
    const t = clockRef.current
    const up = clamp01((t - T.power) / 1.6)
    halo.current?.color.setRGB(0.6, 2.4, 2.8).multiplyScalar(0.3 + 0.9 * up)
    if (pool.current) pool.current.opacity = 0.12 + 0.28 * up
    rings.current?.children.forEach((c, i) => {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial
      const p = ripples ? wavePhase(t - T.waves, i) : null
      if (p === null) return void (m.opacity = 0)
      const s = HALO_R + p * 2.4
      c.scale.set(s, s, s)
      m.opacity = 0.4 * Math.min(1, p * 6) * Math.pow(1 - p, 1.6)
    })
  })
  return (
    <group position={[0, FLOOR_Y + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <planeGeometry args={[3.4, 3.4]} />
        <meshBasicMaterial ref={pool} map={poolTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh>
        <torusGeometry args={[HALO_R, 0.0045, 8, 200]} />
        <meshBasicMaterial ref={halo} toneMapped={false} />
      </mesh>
      <group ref={rings}>
        {Array.from({ length: WAVES }, (_, i) => (
          <mesh key={i} geometry={ringGeo}>
            <meshBasicMaterial color="#67e8f9" transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** A soft light bar that sweeps across the lid once during the intro. */
function LightSweep({ clockRef }: { clockRef: React.RefObject<number> }) {
  const ref = useRef<THREE.RectAreaLight>(null)
  useFrame(() => {
    const l = ref.current
    if (!l) return
    const p = clamp01((clockRef.current - 0.35) / 2.2)
    l.position.x = -2.6 + p * 5.2
    l.intensity = Math.sin(p * Math.PI) * 4
    l.lookAt(l.position.x * 0.2, 0, 0)
  })
  return <rectAreaLight ref={ref} position={[-2.6, 1.4, 1.2]} width={0.35} height={2.6} color="#ffffff" intensity={0} />
}

// ── Callouts ───────────────────────────────────────────────────────────────

/** A dot on the object, a hairline, and a mono label (decorative: the specs are in the page text). */
function Callout({
  position,
  text,
  show,
  align,
  reach = 56,
  layer,
}: {
  position: [number, number, number]
  text: string
  show: boolean
  align: "left" | "right"
  /** Leader length, px. */
  reach?: number
  layer?: React.RefObject<HTMLElement | null>
}) {
  return (
    <Html position={position} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }} portal={layer as React.RefObject<HTMLElement>}>
      <div
        className="relative"
        style={{
          opacity: show ? 1 : 0,
          transform: `translateY(${show ? 0 : 6}px)`,
          transition: "opacity 700ms ease-out, transform 700ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <span className="absolute -top-[4px] -left-[4px] size-2 rounded-full bg-cyan-300 shadow-[0_0_10px_2px_rgb(103_232_249/0.8)]" />
        <span
          className="absolute top-0 h-px"
          style={
            align === "right"
              ? { left: 4, width: reach, background: "linear-gradient(90deg, rgb(103 232 249 / 0.9), rgb(103 232 249 / 0.15))" }
              : { right: 4, width: reach, background: "linear-gradient(270deg, rgb(103 232 249 / 0.9), rgb(103 232 249 / 0.15))" }
          }
        />
        <span
          className="absolute -top-[9px] font-mono text-[0.68rem] tracking-wider whitespace-nowrap text-white/90 uppercase [text-shadow:0_1px_8px_rgb(0_0_0/0.9)]"
          style={align === "right" ? { left: reach + 10 } : { right: reach + 10 }}
        >
          {text}
        </span>
      </div>
    </Html>
  )
}

// ── Rig: timeline, turntable, camera ───────────────────────────────────────

function Rig({
  still,
  interactive,
  track,
  clockRef,
  onStage,
  children,
}: {
  still: boolean
  interactive: boolean
  track?: React.RefObject<HTMLElement | null>
  clockRef: React.RefObject<number>
  onStage: (s: number) => void
  children: React.ReactNode
}) {
  const turn = useRef<THREE.Group>(null)
  const { pointer, invalidate } = useThree()
  const stage = useRef(-1)
  // Still mode renders on demand: a few extra frames let the callouts (whose
  // projection runs before this rig moves the camera) settle on the final pose.
  const settle = useRef(0)
  const base = -0.55
  useFrame(({ camera, size }, dt) => {
    // Narrow boxes (phones): pull the camera back so the antennas keep clear of the edge feather.
    const fit = Math.max(1, 1.2 / (size.width / size.height))
    const step = Math.min(dt, 0.1)
    clockRef.current = still ? 99 : clockRef.current + Math.min(dt, 0.5)
    const t = clockRef.current

    // Scroll: -1 (entering from below) … 1 (leaving at the top).
    let scroll = 0
    const el = track?.current
    if (el && !still) {
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      scroll = Math.max(-1, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2)))
    }

    const g = turn.current
    if (g) {
      const target = still ? base : base + scroll * 0.55 + Math.sin(t * 0.22) * 0.08 + (interactive ? pointer.x * 0.22 : 0)
      g.rotation.y = still ? target : g.rotation.y + (target - g.rotation.y) * (1 - Math.exp(-step * 2.5))
    }

    // Camera: eases in from wide and high during the intro, then rests.
    const e = still ? 1 : easeOutExpo(clamp01(t / T.intro))
    camera.position.set(0, (1.6 - 0.6 * e) * fit + (interactive && !still ? pointer.y * 0.06 : 0), (4.7 - 1.45 * e) * fit)
    camera.lookAt(0, 0.36, 0)

    if (still && settle.current < 3) {
      settle.current++
      invalidate()
    }

    const s = t >= T.callouts + 0.5 ? 3 : t >= T.callouts + 0.25 ? 2 : t >= T.callouts ? 1 : 0
    if (s !== stage.current) {
      stage.current = s
      onStage(s)
    }
  })
  return <group ref={turn}>{children}</group>
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
  quality = "high",
  callouts,
  calloutLayer,
  track,
  onReady,
}: {
  still: boolean
  interactive: boolean
  /** On screen: animate; off screen: hold the last frame. */
  active: boolean
  quality?: "high" | "low"
  callouts?: ModemCallouts
  /** Unmasked element the callouts render into (same box as the canvas). */
  calloutLayer?: React.RefObject<HTMLElement | null>
  /** The element whose scroll position turns the modem. */
  track?: React.RefObject<HTMLElement | null>
  onReady?: () => void
}) {
  const [fx, setFx] = useState(quality === "high")
  const [stage, setStage] = useState(0)
  const clockRef = useRef(0)

  return (
    <Canvas
      dpr={[1, quality === "high" ? 1.75 : 1.25]}
      frameloop={still || !active ? "demand" : "always"}
      camera={{ position: [0, 1.0, 3.25], fov: 30 }}
      gl={{ antialias: true, powerPreference: "high-performance", toneMappingExposure: 1.05 }}
    >
      {quality === "high" && <PerformanceMonitor onDecline={() => setFx(false)} />}
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 3.6, 7.5]} />

      <ambientLight intensity={0.18} />
      <directionalLight position={[-2.5, 3.8, 2.2]} intensity={1.5} />
      <directionalLight position={[2.2, 1.2, 2.8]} intensity={0.35} />
      {/* Spotlight pool on the floor. */}
      <spotLight position={[0, 5, 0.8]} angle={0.42} penumbra={1} intensity={22} decay={2} color="#eaf8ff" />
      <Environment resolution={256} frames={1}>
        {/* Overhead softbox, front key strip, cyan rim, white back rim. */}
        <Lightformer form="rect" intensity={1.5} position={[0, 4, 0.5]} rotation={[Math.PI / 2, 0, 0]} scale={[5, 3, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[-3, 1.5, 2.6]} rotation={[0, Math.PI / 4, 0]} scale={[1.2, 4, 1]} />
        <Lightformer form="rect" intensity={2.6} color="#67e8f9" position={[3.2, 0.8, -1.2]} rotation={[0, -Math.PI / 2, 0]} scale={[0.6, 3.5, 1]} />
        <Lightformer form="rect" intensity={2} position={[0, 1.4, -3.4]} scale={[6, 0.5, 1]} />
      </Environment>

      <Rig still={still} interactive={interactive} track={track} clockRef={clockRef} onStage={setStage}>
        <Body />
        <Leds clockRef={clockRef} />
        {!still && <Wavefronts clockRef={clockRef} />}
        {callouts && quality === "high" && (
          <>
            <Callout position={[-ANTENNA_X, HINGE_Y + ANTENNA.h * 0.9, ANTENNA_Z]} text={callouts.antennas} show={stage >= 1} align="left" layer={calloutLayer} />
            <Callout position={[HALO_R * 0.26, FLOOR_Y + 0.004, HALO_R * 0.96]} text={callouts.speed} show={stage >= 2} align="right" reach={48} layer={calloutLayer} />
            <Callout position={[-0.18, BODY.h / 2 + 0.002, BODY.d / 2 - 0.075]} text={callouts.mlo} show={stage >= 3} align="left" reach={150} layer={calloutLayer} />
          </>
        )}
      </Rig>
      {!still && <LightSweep clockRef={clockRef} />}
      <FloorLight clockRef={clockRef} ripples={!still} />

      {/* Studio floor: glossy and reflective (high), or a plain dark satin (low). */}
      <mesh position={[0, FLOOR_Y - 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14]} />
        {fx ? (
          <MeshReflectorMaterial
            blur={[400, 120]}
            resolution={1024}
            mixBlur={1.1}
            mixStrength={2.4}
            mixContrast={1.1}
            mirror={0.6}
            depthScale={1.1}
            minDepthThreshold={0.35}
            maxDepthThreshold={1.3}
            roughness={0.9}
            metalness={0.55}
            color="#0a0d13"
          />
        ) : (
          <meshStandardMaterial color="#0a0d13" roughness={0.55} metalness={0.3} />
        )}
      </mesh>
      <ContactShadows
        position={[0, FLOOR_Y + 0.001, 0]}
        opacity={0.9}
        scale={3}
        blur={2.2}
        far={1}
        resolution={fx ? 512 : 256}
        frames={fx && !still ? Infinity : 1}
        color="#000000"
      />

      {fx && (
        <EffectComposer multisampling={4}>
          <Bloom luminanceThreshold={1.4} luminanceSmoothing={0.15} intensity={0.75} radius={0.7} mipmapBlur />
          {/* The composer turns the renderer's tone mapping off; apply it last. */}
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
      <Ready onReady={onReady} />
    </Canvas>
  )
}
