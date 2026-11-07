"use client"

import { useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { PerformanceMonitor } from "@react-three/drei"
import { EffectComposer, Bloom } from "@react-three/postprocessing"
import * as THREE from "three"

/**
 * "Simetría en luz": two counter-flowing streams of light streaks inside a
 * glass fiber tube. Download runs left→right in the upper half, upload
 * right→left in the lower half. Density and speed follow the selected plan;
 * "asymmetric" mode thins and slows the upload stream and turns it amber.
 * The cursor parts the streams. Loaded only via next/dynamic ({ ssr: false })
 * from SymmetryLight, so three.js stays out of the initial bundle (hard rule
 * #8); never mounted under reduced motion (the SVG frame is the static
 * alternative). PerformanceMonitor drops bloom and halves streaks on low FPS.
 */

export interface StreamTarget {
  /** 0..1 share of streaks shown. */
  density: number
  /** World units per second. */
  speed: number
  color: string
  /** Brightness/thickness multiplier (e.g. to make a sparse stream readable). */
  glow?: number
}

const SPAN = 11
const RADIUS = 1
const CYAN = "#22d3ee"

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uSpan;
  uniform float uDir;
  uniform float uSide;
  uniform float uSpeed;
  uniform float uDensity;
  uniform float uRadius;
  uniform vec3 uPointer;
  uniform float uPush;
  uniform float uGain;
  attribute vec4 aSeed;
  varying float vAlpha;
  varying float vBoost;
  varying vec2 vUv;

  void main() {
    float on = step(aSeed.w, uDensity);
    float speed = uSpeed * (0.7 + aSeed.y * 0.6);
    // Travelled distance; mod keeps every streak cycling through the tube.
    float x = mod(aSeed.x * uSpan + uTime * speed, uSpan) - uSpan * 0.5;
    x *= uDir;
    // Round cross-section: download fills the upper half of the core,
    // upload the lower half (angle around the axis + radius).
    float theta = mix(0.08, 0.92, fract(aSeed.y * 7.13 + aSeed.z)) * 3.14159;
    float r = mix(0.12, 0.88, sqrt(aSeed.y)) * uRadius;
    float y = uSide * sin(theta) * r;
    float z = cos(theta) * r;
    // Gentle zig-zag: a nod to total internal reflection.
    y += sin(x * 1.3 + aSeed.z * 6.2831) * 0.06 * uRadius;

    // Cursor parts the stream (pushes streaks away vertically).
    vec2 d = vec2(x, y) - uPointer.xy;
    float f = exp(-dot(d, d) * 1.2) * uPush;
    y += sign(d.y + 1e-3) * f * 0.55;

    float edge = smoothstep(uSpan * 0.5, uSpan * 0.5 - 2.8, abs(x));
    // A few bright "packets" give the flow hierarchy.
    float packet = step(0.93, aSeed.z);
    vBoost = 1.0 + packet * 1.4;
    vAlpha = on * edge * mix(0.35, 0.8, aSeed.z);

    // Streak length grows with speed; quad is stretched along x.
    float len = (0.16 + speed * 0.14) * (1.0 + packet * 0.8);
    float thick = (0.04 + packet * 0.03) * mix(1.0, uGain, 0.5);
    vec3 pos = vec3(x + position.x * len, y + position.y * thick, z);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDir;
  uniform float uGain;
  varying float vAlpha;
  varying float vBoost;
  varying vec2 vUv;

  void main() {
    float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
    float along = uDir > 0.0 ? vUv.x : 1.0 - vUv.x; // bright head, fading tail
    float a = pow(across, 1.6) * pow(along, 2.2) * vAlpha;
    gl_FragColor = vec4(uColor * (0.45 + along * 1.1) * vBoost * uGain, a);
  }
`

function Stream({
  target,
  dir,
  count,
}: {
  target: StreamTarget
  dir: 1 | -1
  count: number
}) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const pointerWorld = useRef(new THREE.Vector3(99, 99, 0))
  const lastPointer = useRef(new THREE.Vector2())
  const push = useRef(0)
  const { viewport } = useThree()

  const geometry = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1)
    const g = new THREE.InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute("position", base.getAttribute("position"))
    g.setAttribute("uv", base.getAttribute("uv"))
    const seeds = new Float32Array(count * 4)
    // Deterministic pseudo-random so every mount looks the same.
    let s = dir > 0 ? 7 : 13
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = rand()
      seeds[i * 4 + 1] = rand()
      seeds[i * 4 + 2] = rand()
      seeds[i * 4 + 3] = rand()
    }
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4))
    g.instanceCount = count
    return g
  }, [count, dir])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpan: { value: SPAN },
      uDir: { value: dir },
      uSide: { value: dir },
      uSpeed: { value: target.speed },
      uDensity: { value: target.density },
      uRadius: { value: RADIUS },
      uPointer: { value: new THREE.Vector3(99, 99, 0) },
      uPush: { value: 0 },
      uGain: { value: target.glow ?? 1 },
      uColor: { value: new THREE.Color(target.color) },
    }),
    // Initial values only; targets are eased in useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniforms must stay the same object
    [dir]
  )
  const travelled = useRef(0)
  const color = useMemo(() => new THREE.Color(), [])

  useFrame((state, delta) => {
    const m = mat.current
    if (!m) return
    const dt = Math.min(delta, 0.05)
    const k = 1 - Math.exp(-dt * 3) // ~0.3 s ease
    const u = m.uniforms
    u.uSpeed.value += (target.speed - u.uSpeed.value) * k
    u.uDensity.value += (target.density - u.uDensity.value) * k
    u.uGain.value += ((target.glow ?? 1) - u.uGain.value) * k
    u.uColor.value.lerp(color.set(target.color), k)
    // Integrate distance so speed changes don't make streaks jump.
    travelled.current += dt
    u.uTime.value = travelled.current

    // Pointer → world (z = 0 plane); push eases in while the pointer moves.
    const p = state.pointer
    const moved = p.distanceToSquared(lastPointer.current) > 1e-6
    lastPointer.current.copy(p)
    pointerWorld.current.set((p.x * viewport.width) / 2, (p.y * viewport.height) / 2, 0)
    u.uPointer.value.lerp(pointerWorld.current, 1 - Math.exp(-dt * 10))
    push.current += ((moved ? 1 : 0) - push.current) * (1 - Math.exp(-dt * (moved ? 8 : 1.2)))
    u.uPush.value = push.current
  })

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

const glassVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vX;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    vX = position.y; // cylinder axis is local y
    gl_Position = projectionMatrix * mv;
  }
`
const glassFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uSpan;
  uniform float uStrength;
  varying vec3 vNormal;
  varying vec3 vView;
  varying float vX;
  void main() {
    float fres = pow(1.0 - abs(dot(vNormal, vView)), 5.0);
    float edge = smoothstep(uSpan * 0.5, uSpan * 0.5 - 2.5, abs(vX));
    gl_FragColor = vec4(uColor, fres * uStrength * edge);
  }
`

/** Glass cladding: fresnel rim only (cheap, reads as a glass tube). */
function Glass({ radius, strength }: { radius: number; strength: number }) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color("#67e8f9") },
      uSpan: { value: SPAN },
      uStrength: { value: strength },
    }),
    [strength]
  )
  return (
    <mesh rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[radius, radius, SPAN, 64, 1, true]} />
      <shaderMaterial
        vertexShader={glassVertex}
        fragmentShader={glassFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

/** Faint core line between the two streams. */
function Core() {
  return (
    <mesh rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.006, 0.006, SPAN - 3, 8, 1, true]} />
      <meshBasicMaterial color={CYAN} transparent opacity={0.35} />
    </mesh>
  )
}

/** Eases the whole fiber toward the pointer (max ~5°). */
function Rig({ interactive, children }: { interactive: boolean; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null)
  useFrame((state, delta) => {
    if (!g.current) return
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 2.5)
    const tx = interactive ? state.pointer.y * -0.09 : 0
    const ty = interactive ? state.pointer.x * 0.12 : 0
    // Base pose: angled so the fiber recedes into depth, seen slightly from above.
    g.current.rotation.x += (tx + 0.16 - g.current.rotation.x) * k
    g.current.rotation.y += (ty - 0.28 - g.current.rotation.y) * k
  })
  return <group ref={g}>{children}</group>
}

export function SymmetryScene({
  down,
  up,
  quality,
  interactive,
  onReady,
}: {
  down: StreamTarget
  up: StreamTarget
  quality: "mobile" | "desktop"
  interactive: boolean
  onReady?: () => void
}) {
  const [bloom, setBloom] = useState(true)
  const [lite, setLite] = useState(false)
  const base = quality === "mobile" ? 450 : 900
  const count = lite ? Math.round(base / 2) : base

  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, quality === "mobile" ? 1.25 : 1.75]}
      gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, quality === "mobile" ? 6.6 : 6], fov: 40 }}
      onCreated={({ gl }) => {
        gl.setClearAlpha(0)
        requestAnimationFrame(() => onReady?.())
      }}
    >
      <PerformanceMonitor
        onDecline={() => {
          setBloom(false)
          setLite(true)
        }}
      />
      <Rig interactive={interactive}>
        <Glass radius={RADIUS * 1.06} strength={0.9} />
        <Glass radius={RADIUS * 1.2} strength={0.25} />
        <Core />
        <Stream key={`d${count}`} target={down} dir={1} count={count} />
        <Stream key={`u${count}`} target={up} dir={-1} count={count} />
      </Rig>
      {bloom && (
        <EffectComposer>
          <Bloom luminanceThreshold={0.3} intensity={0.95} radius={0.7} mipmapBlur />
        </EffectComposer>
      )}
    </Canvas>
  )
}

export default SymmetryScene
