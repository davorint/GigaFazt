"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { PerformanceMonitor } from "@react-three/drei"
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing"
import * as THREE from "three"

/**
 * "Dentro de la fibra" (owner redesign, 2026-11-07): the camera flies from
 * outside a glass fiber into its core as the section scrolls in, then looks
 * down the core. Download = cyan light rushing toward the viewer, upload =
 * violet light leaving toward the network; each beam either spirals along the
 * wall (skew ray) or zig-zags through the axis (meridional ray) with a glint at
 * every reflection (total internal reflection). The two directions twist in
 * opposite senses, braiding into a double helix. Asymmetric mode collapses the
 * upload braid into a thin, dim thread. Cursor: look around + light the beams
 * near the pointer. Everything is computed on the GPU from per-segment seeds.
 *
 * Loaded only via next/dynamic ({ ssr: false }) from SymmetryLight (hard rule
 * #8). `still` renders one static frame (reduced motion / paused animations).
 * Custom shaders end with <colorspace_fragment> so colors match their hex
 * values (the previous scene skipped it and rendered too dark).
 */

export interface StreamTarget {
  /** 0..1 share of beams shown. */
  active: number
  /** Packet speed, world units per second. */
  speed: number
  color: string
  /** 1 = beams fill the core; small = collapsed into a thread on the axis. */
  radius: number
  /** Brightness multiplier. */
  gain: number
  /** 0..1: moves a collapsed stream off the axis (so the thread stays visible from inside). */
  shift?: number
}

/** Shared mutable scroll progress (0 = outside the fiber, 1 = inside the core). */
export interface Progress {
  value: number
}

type PointerState = { x: number; y: number; on: number }

const L = 80 // core length rendered
const SPACING = 10 // distance between light packets on a beam
const WALL = 1.03

// ---------------------------------------------------------------- beams
const PATH = /* glsl */ `
  // Safe pow: D3D (ANGLE) returns NaN for pow(x <= 0, y); bloom smears NaN black.
  float spow(float x, float y) { return pow(max(x, 1e-6), y); }
  uniform float uDir;
  uniform float uTwist;
  uniform float uRad;
  uniform float uShift;
  // ray: x = start angle, y = phase, z = kind (0 skew/helix, 1 meridional), w = radius or period
  vec3 pathPos(float s, vec4 ray, out float glint) {
    glint = 0.0;
    vec2 xy;
    if (ray.z < 0.5) {
      float a = ray.x + uTwist * uDir * s;
      xy = vec2(cos(a), sin(a)) * ray.w;
    } else {
      float a = ray.x + uTwist * uDir * 0.12 * s;
      float period = 4.0 + ray.w * 2.5;
      float tri = abs(fract(s / period + ray.y) * 2.0 - 1.0) * 2.0 - 1.0;
      glint = smoothstep(0.82, 1.0, abs(tri));
      xy = vec2(cos(a), sin(a)) * tri;
    }
    return vec3(xy * uRad + vec2(0.66, -0.1) * uShift, -s);
  }
`

const beamVertex = /* glsl */ `
  uniform float uDs;
  uniform float uL;
  uniform float uTravel;
  uniform float uSpacing;
  uniform float uActive;
  uniform float uGain;
  uniform float uWidth;
  uniform vec2 uRes;
  uniform vec2 uPointer;
  uniform float uPointerOn;
  attribute float aS;
  attribute vec4 aRay;
  attribute float aRank;
  varying float vI;
  varying float vSide;
  ${PATH}

  void main() {
    // position.x: 0 = segment start, 1 = end; position.y: side -1..1
    float g0; float g1;
    vec3 pA = pathPos(aS, aRay, g0);
    vec3 pB = pathPos(aS + uDs, aRay, g1);
    float end = position.x;
    float s = aS + uDs * end;
    vec3 p = mix(pA, pB, end);
    float glint = mix(g0, g1, end);

    vec4 mvA = modelViewMatrix * vec4(pA, 1.0);
    vec4 mvB = modelViewMatrix * vec4(pB, 1.0);
    // Segments touching the camera plane would explode in screen space.
    if (min(-mvA.z, -mvB.z) < 0.06) {
      gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      vI = 0.0;
      vSide = 0.0;
      return;
    }
    vec4 cA = projectionMatrix * mvA;
    vec4 cB = projectionMatrix * mvB;

    // Light packets: download (uDir > 0) moves toward the end face (s -> 0),
    // upload away from it. Bright head, fading tail.
    float x = (s + uDir * uTravel) / uSpacing + aRay.y * 7.0;
    float q = fract(x);
    float pulse = uDir > 0.0 ? spow(1.0 - q, 7.0) : spow(q, 7.0);

    float on = 1.0 - smoothstep(uActive - 0.06, uActive, aRank);
    float d = -mix(mvA.z, mvB.z, end);
    // Far beams converge at the vanishing point: attenuate so it doesn't burn white.
    float fade = smoothstep(uL * 0.7, 6.0, s) * smoothstep(0.0, 0.6, s) * smoothstep(0.35, 2.8, d);
    vec2 dp = p.xy - uPointer;
    float hl = exp(-dot(dp, dp) * 4.0) * uPointerOn;

    vec4 c = end < 0.5 ? cA : cB;
    vec2 sa = cA.xy / cA.w * uRes;
    vec2 sb = cB.xy / cB.w * uRes;
    vec2 dv = sb - sa;
    vec2 dir = dot(dv, dv) > 1e-10 ? normalize(dv) : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float w = uWidth * (1.0 + pulse * 2.4 + glint * 1.2 + hl * 0.8);
    c.xy += nrm * position.y * w / uRes * c.w;
    gl_Position = c;

    vSide = position.y;
    vI = on * fade * (0.16 + pulse * 2.2 + glint * 0.7 + hl * 1.0) * uGain;
  }
`

const beamFragment = /* glsl */ `
  float spow(float x, float y) { return pow(max(x, 1e-6), y); }
  uniform vec3 uColor;
  varying float vI;
  varying float vSide;
  void main() {
    // Clamp every pow() base: interpolation can push |vSide| a hair past 1 and
    // D3D (ANGLE) returns NaN for pow(negative), which bloom then smears black.
    float edge = clamp(1.0 - abs(vSide), 0.0, 1.0);
    float a = spow(edge, 1.4) * clamp(vI, 0.0, 8.0);
    if (!(a > 0.002)) discard; // also drops NaN
    // White-hot core where intensity is high.
    vec3 col = mix(uColor, vec3(1.0), clamp((vI - 1.6) * 0.3, 0.0, 0.45));
    gl_FragColor = vec4(max(col * a, vec3(0.0)), 1.0);
    #include <colorspace_fragment>
  }
`

function Beams({
  target,
  dir,
  rays,
  ds,
  still,
  pointer,
}: {
  target: StreamTarget
  dir: 1 | -1
  rays: number
  ds: number
  still: boolean
  pointer: React.RefObject<PointerState>
}) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const size = useMemo(() => new THREE.Vector2(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const speed = useRef(target.speed)

  const geometry = useMemo(() => {
    // One quad per segment: x = start/end, y = side.
    const g = new THREE.InstancedBufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0], 3))
    g.setIndex([0, 2, 1, 2, 3, 1])
    const segs = Math.floor(L / ds)
    const n = rays * segs
    const aS = new Float32Array(n)
    const aRay = new Float32Array(n * 4)
    const aRank = new Float32Array(n)
    let seed = dir > 0 ? 11 : 29
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    for (let r = 0; r < rays; r++) {
      const kind = r % 5 < 4 ? 0 : 1 // 80% helices (the braid), 20% zig-zags
      const ray = [rand() * Math.PI * 2, rand(), kind, kind === 0 ? 0.5 + rand() * 0.45 : rand()]
      const rank = (r + 0.5) / rays
      for (let i = 0; i < segs; i++) {
        const k = r * segs + i
        aS[k] = i * ds
        aRay.set(ray, k * 4)
        aRank[k] = rank
      }
    }
    g.setAttribute("aS", new THREE.InstancedBufferAttribute(aS, 1))
    g.setAttribute("aRay", new THREE.InstancedBufferAttribute(aRay, 4))
    g.setAttribute("aRank", new THREE.InstancedBufferAttribute(aRank, 1))
    g.instanceCount = n
    return g
  }, [rays, ds, dir])
  useEffect(() => () => geometry.dispose(), [geometry])

  const uniforms = useMemo(
    () => ({
      uDir: { value: dir },
      uTwist: { value: 0.34 },
      uRad: { value: target.radius },
      uShift: { value: target.shift ?? 0 },
      uDs: { value: ds },
      uL: { value: L },
      uTravel: { value: 3 },
      uSpacing: { value: SPACING },
      uActive: { value: target.active },
      uGain: { value: target.gain },
      uWidth: { value: 1.6 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2(9, 9) },
      uPointerOn: { value: 0 },
      uColor: { value: new THREE.Color(target.color) },
    }),
    // Initial values only; targets are eased per frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- uniforms must stay the same object
    [dir, ds]
  )

  useFrame((state, delta) => {
    const m = mat.current
    if (!m) return
    const u = m.uniforms
    const dt = still ? 0 : Math.min(delta, 0.05)
    const k = still ? 1 : 1 - Math.exp(-dt * 2.5)
    u.uActive.value += (target.active - u.uActive.value) * k
    u.uRad.value += (target.radius - u.uRad.value) * k
    u.uShift.value += ((target.shift ?? 0) - u.uShift.value) * k
    u.uGain.value += (target.gain - u.uGain.value) * k
    u.uColor.value.lerp(color.set(target.color), k)
    // Integrate distance so speed changes never make packets jump.
    speed.current += (target.speed - speed.current) * k
    u.uTravel.value += speed.current * dt
    state.gl.getDrawingBufferSize(size)
    u.uRes.value.set(size.x, size.y)
    u.uWidth.value = 1.5 * state.viewport.dpr
    const p = pointer.current
    u.uPointer.value.set(p.x, p.y)
    u.uPointerOn.value = p.on
  })

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        vertexShader={beamVertex}
        fragmentShader={beamFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

// ---------------------------------------------------------------- core wall
const wallVertex = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vV = cameraPosition - w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const wallFragment = /* glsl */ `
  float spow(float x, float y) { return pow(max(x, 1e-6), y); }
  uniform float uTime;
  uniform float uFlow;
  uniform float uL;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform float uMix;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float a = atan(vW.y, vW.x);
    float s = -vW.z;
    float fres = spow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 4.0);
    // Caustics: interference bands drifting along the glass.
    float c1 = sin(a * 5.0 + s * 0.9 + uTime * 0.9) * sin(a * 3.0 - s * 0.55 - uTime * 0.6 + 1.3);
    float caust = smoothstep(0.5, 1.0, c1);
    // Faint rings sliding past: the feeling of gliding down the core.
    float rings = smoothstep(0.93, 1.0, fract((s + uFlow) / 3.2));
    float fade = smoothstep(uL * 0.6, 4.0, s) * smoothstep(0.0, 1.2, s);
    vec3 col = mix(uC1, uC2, uMix * (0.5 + 0.5 * sin(a * 2.0 + s * 0.15)));
    float alpha = (0.012 + fres * 0.10 + caust * 0.06 + rings * 0.06) * fade;
    gl_FragColor = vec4(col * alpha, 1.0);
    #include <colorspace_fragment>
  }
`

function CoreWall({ up, still, flowSpeed }: { up: StreamTarget; still: boolean; flowSpeed: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 2 },
      uFlow: { value: 0 },
      uL: { value: L },
      uC1: { value: new THREE.Color("#22d3ee") },
      uC2: { value: new THREE.Color("#a78bfa") },
      uMix: { value: 1 },
    }),
    []
  )
  useFrame((_, delta) => {
    const u = mat.current?.uniforms
    if (!u) return
    const dt = still ? 0 : Math.min(delta, 0.05)
    u.uTime.value += dt
    u.uFlow.value += dt * flowSpeed
    const k = still ? 1 : 1 - Math.exp(-dt * 2.5)
    u.uMix.value += (Math.min(1, up.radius) * up.gain - u.uMix.value) * k
  })
  return (
    <mesh position={[0, 0, -L / 2]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[WALL, WALL, L, 96, 160, true]} />
      <shaderMaterial
        ref={mat}
        vertexShader={wallVertex}
        fragmentShader={wallFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

// ---------------------------------------------------------------- outside: cladding + end face
const claddingFragment = /* glsl */ `
  float spow(float x, float y) { return pow(max(x, 1e-6), y); }
  uniform float uL;
  uniform float uOpacity;
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float s = -vW.z;
    float fres = spow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 3.0);
    float fade = smoothstep(uL, uL * 0.3, s);
    float a = (0.004 + fres * 0.28) * fade * uOpacity;
    gl_FragColor = vec4(vec3(0.13, 0.83, 0.93) * a, 1.0);
    #include <colorspace_fragment>
  }
`
const faceFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0; // 0 center .. 1 cladding edge
    float core = smoothstep(0.7, 0.0, r) * 0.3;
    float ring = smoothstep(0.03, 0.0, abs(r - 0.69)) * 0.9 + smoothstep(0.04, 0.0, abs(r - 0.98)) * 0.6;
    float a = (core + ring) * uOpacity;
    gl_FragColor = vec4(vec3(0.55, 0.95, 1.0) * a, 1.0);
    #include <colorspace_fragment>
  }
`
const uvVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

function Outside({ opacity }: { opacity: React.RefObject<number> }) {
  const clad = useRef<THREE.ShaderMaterial>(null)
  const face = useRef<THREE.ShaderMaterial>(null)
  const cladU = useMemo(() => ({ uL: { value: L }, uOpacity: { value: 1 } }), [])
  const faceU = useMemo(() => ({ uOpacity: { value: 1 } }), [])
  useFrame(() => {
    if (clad.current) clad.current.uniforms.uOpacity.value = opacity.current
    if (face.current) face.current.uniforms.uOpacity.value = opacity.current
  })
  return (
    <>
      <mesh position={[0, 0, -L / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.5, 1.5, L, 96, 1, true]} />
        <shaderMaterial
          ref={clad}
          vertexShader={wallVertex}
          fragmentShader={claddingFragment}
          uniforms={cladU}
          transparent
          depthWrite={false}
          side={THREE.FrontSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <circleGeometry args={[1.5, 96]} />
        <shaderMaterial
          ref={face}
          vertexShader={uvVertex}
          fragmentShader={faceFragment}
          uniforms={faceU}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </>
  )
}

/** Bright vanishing point at the far end: "la red". */
function FarGlow() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas")
    c.width = c.height = 128
    const ctx = c.getContext("2d")
    if (ctx) {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
      g.addColorStop(0, "rgba(255,255,255,1)")
      g.addColorStop(0.15, "rgba(165,243,252,0.85)")
      g.addColorStop(0.45, "rgba(34,211,238,0.25)")
      g.addColorStop(1, "rgba(34,211,238,0)")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, 128, 128)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <sprite position={[0, 0, -L * 0.7]} scale={[5, 5, 1]}>
      <spriteMaterial map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.55} />
    </sprite>
  )
}

/** Dust motes around the strand: depth cues for the fly-in. */
function Dust({ opacity }: { opacity: React.RefObject<number> }) {
  const mat = useRef<THREE.PointsMaterial>(null)
  const geometry = useMemo(() => {
    let seed = 5
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const n = 700
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2
      const r = 2.2 + rand() * 9
      pos.set([Math.cos(a) * r, Math.sin(a) * r * 0.7, 6 - rand() * 50], i * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    if (mat.current) mat.current.opacity = 0.55 * opacity.current
  })
  return (
    <points geometry={geometry}>
      <pointsMaterial ref={mat} color="#67e8f9" size={0.05} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

// ---------------------------------------------------------------- camera
const ease = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

function CameraRig({
  progressRef,
  interactive,
  still,
  mobile,
  pointerRef,
  outsideRef,
}: {
  progressRef: React.RefObject<Progress>
  interactive: boolean
  still: boolean
  mobile: boolean
  pointerRef: React.RefObject<PointerState>
  outsideRef: React.RefObject<number>
}) {
  const p = useRef(-1)
  // Scratch objects mutated every frame (refs, not render values).
  const scratch = useRef({ look: new THREE.Vector2(), pos: new THREE.Vector3(), target: new THREE.Vector3() })
  const curve = useMemo(() => {
    const far = mobile ? 1.35 : 1
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(5.4 * far, 2.1 * far, 7.8 * far),
      new THREE.Vector3(2.6, 0.9, 4.4),
      new THREE.Vector3(0.15, 0.05, 1.9),
      new THREE.Vector3(0, 0, -1.6),
    ])
  }, [mobile])
  const from = useMemo(() => new THREE.Vector3(-1.2, -0.2, -9), [])
  const to = useMemo(() => new THREE.Vector3(0, 0, -40), [])

  useFrame((state, delta) => {
    const { look, pos, target } = scratch.current
    // Real elapsed time (capped at 0.25 s), so slow devices don't lag behind the scroll.
    const dt = Math.min(delta, 0.25)
    const goal = still ? 1 : progressRef.current.value
    // First frame snaps (no fly-in replay when mounting mid-page).
    p.current = p.current < 0 || still ? goal : p.current + (goal - p.current) * (1 - Math.exp(-dt * 3))
    const e = ease(clamp01(p.current))
    const inside = ease(clamp01((e - 0.78) / 0.22))

    // Pointer: orbit a little outside, look around inside.
    const px = interactive ? state.pointer.x : 0
    const py = interactive ? state.pointer.y : 0
    const kl = still ? 1 : 1 - Math.exp(-dt * 3)
    look.x += (px - look.x) * kl
    look.y += (py - look.y) * kl

    curve.getPoint(e, pos)
    pos.x += look.x * (0.8 * (1 - inside) + 0.28 * inside)
    pos.y += look.y * (0.5 * (1 - inside) + 0.2 * inside)
    target.lerpVectors(from, to, e)
    target.x -= look.x * 3 * inside
    target.y -= look.y * 2 * inside
    const cam = state.camera as THREE.PerspectiveCamera
    cam.position.copy(pos)
    cam.lookAt(target)

    const fov0 = mobile ? 50 : 36
    const fov1 = mobile ? 82 : 70
    const fov = fov0 + (fov1 - fov0) * inside
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }

    // End face, cladding and dust fade as the camera goes through the end face.
    outsideRef.current = clamp01((pos.z - 0.2) / 2.4)
    // Pointer highlight lives in the core cross-section.
    const ptr = pointerRef.current
    ptr.x = look.x * 0.9
    ptr.y = look.y * 0.9
    ptr.on += ((interactive ? inside : 0) - ptr.on) * kl
  })
  return null
}

/** Renders a fresh frame when inputs change while the frame loop is off (still mode). */
function Invalidate({ down, up }: { down: StreamTarget; up: StreamTarget }) {
  const { invalidate } = useThree()
  useEffect(() => {
    invalidate()
    const id = window.setTimeout(() => invalidate(), 50)
    return () => window.clearTimeout(id)
  }, [down, up, invalidate])
  return null
}

export function SymmetryScene({
  down,
  up,
  quality,
  interactive,
  still,
  progress,
  onReady,
}: {
  down: StreamTarget
  up: StreamTarget
  quality: "mobile" | "desktop"
  interactive: boolean
  still: boolean
  progress: React.RefObject<Progress>
  onReady?: () => void
}) {
  const mobile = quality === "mobile"
  const [fx, setFx] = useState(true)
  const [lite, setLite] = useState(false)
  const rays = lite || mobile ? 22 : 40
  const ds = lite || mobile ? 0.16 : 0.1
  const pointer = useRef<PointerState>({ x: 9, y: 9, on: 0 })
  const outside = useRef(1)

  return (
    <Canvas
      className="h-full w-full"
      flat
      frameloop={still ? "demand" : "always"}
      dpr={[1, mobile ? 1.25 : 1.6]}
      gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
      camera={{ position: [5.4, 2.1, 7.8], fov: 36, near: 0.03, far: 200 }}
      onCreated={({ gl }) => {
        gl.setClearAlpha(0)
        requestAnimationFrame(() => onReady?.())
      }}
    >
      <PerformanceMonitor
        onDecline={() => {
          setFx(false)
          setLite(true)
        }}
      />
      <CameraRig progressRef={progress} interactive={interactive} still={still} mobile={mobile} pointerRef={pointer} outsideRef={outside} />
      <Dust opacity={outside} />
      <Outside opacity={outside} />
      <CoreWall up={up} still={still} flowSpeed={(down.speed + up.speed) * 0.12} />
      <FarGlow />
      <Beams key={`d${rays}`} target={down} dir={1} rays={rays} ds={ds} still={still} pointer={pointer} />
      <Beams key={`u${rays}`} target={up} dir={-1} rays={rays} ds={ds} still={still} pointer={pointer} />
      {still && <Invalidate down={down} up={up} />}
      {fx && (
        <EffectComposer>
          <Bloom luminanceThreshold={0.28} luminanceSmoothing={0.35} intensity={0.85} radius={0.72} mipmapBlur />
          <Vignette offset={0.3} darkness={0.75} />
        </EffectComposer>
      )}
    </Canvas>
  )
}

export default SymmetryScene
