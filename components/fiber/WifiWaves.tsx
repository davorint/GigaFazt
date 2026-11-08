"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { APT, BANDS, type BandId, type Pt } from "@/lib/wifi"
import { DAMP_SCALE, SIM_C, SIM_H, SIM_W, Z_MAX, bandOmega, buildMedium, toUv } from "@/lib/wifi-sim"

/**
 * GPU wave simulation for "Así viaja el Wi-Fi por tu depa" (lib/wifi-sim.ts):
 * a 2D wave equation stepped in a fragment shader (leapfrog, three ping-pong
 * half-float targets), R/G/B = 2.4/5/6 GHz fields, A = a slow energy average
 * for the coverage glow. Walls come from two medium textures: per band, a
 * wave impedance (how much a wall reflects) and a conductive loss (how much
 * it absorbs), fitted to real walls (lib/wifi-sim). `show` hides bands from
 * the picture (and the glow) without stopping them. Loaded only via next/dynamic from
 * WifiLab (three.js stays out of the initial bundle). Decorative: WifiLab
 * carries the text equivalent.
 *
 * Runs only while on screen and the tab is visible. `still` (reduced motion /
 * paused animations) renders one settled frame, re-rendered when inputs change.
 * Real-GPU safety (see the "Dentro de la fibra" fix): no pow() on signed
 * values, every field value is NaN-guarded and clamped.
 */

/**
 * Simulation speed in steps per second, independent of the display refresh
 * rate (a fixed number of steps per frame ran 2–3× faster on 144 Hz screens).
 * 40 steps/s makes one 2.4 GHz cycle last ~1.1 s and 6 GHz ~0.45 s, so the
 * rings can be followed by eye as they cross the walls.
 */
const STEPS_PER_SECOND = 40
/** Never more than this per frame (after a stall, catch up gently). */
const MAX_STEPS_PER_FRAME = 4
/** Steps run before the first animated frame, so the field isn't empty. */
const WARM_STEPS = 360
const STILL_STEPS = 900
/**
 * Data rings: thin, crisp, near-white rings travelling out from the modem at
 * the wave speed, drawn over the (soft, band-colored) field. Spacing is
 * RING_CELLS / density (lib/wifi dataDensity: the generation's total Wi-Fi
 * rate vs the fastest compared), so Wi-Fi 7 shows ~6× Wi-Fi 4's rings. They
 * fade with the local signal energy, so walls dim them like the field and
 * range reads the same for every generation. An overlay, not physics: gating
 * the source instead was invisible (wall echoes filled every room alike), and
 * rings near the carrier's wavelength blended into its fringes.
 */
const RING_CELLS = 30 // ~1 m apart at the fastest rate
const RING_SIGMA = 1.3 // ring half-width, cells: crisp, unlike the carrier fringes

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`

const SIM_FRAG = /* glsl */ `
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform sampler2D uDamp;
uniform sampler2D uImp;
uniform vec2 uTexel;
uniform vec2 uSrc;
uniform vec3 uOmega;
uniform vec3 uActive;
uniform vec3 uEnergy;
uniform float uTime;
uniform float uC2;
uniform float uDampScale;
uniform float uZSpan;
uniform float uAmp;
varying vec2 vUv;

vec3 zAt(vec2 uv) { return 1.0 + texture2D(uImp, uv).rgb * uZSpan; }
// One neighbor's pull: face impedance (harmonic mean) times the difference.
vec3 pull(vec2 off, vec3 u, vec3 z) {
  vec3 zn = zAt(vUv + off);
  return 2.0 * z * zn / (z + zn) * (texture2D(uCur, vUv + off).rgb - u);
}

void main() {
  vec4 c = texture2D(uCur, vUv);
  vec3 p = texture2D(uPrev, vUv).rgb;
  vec3 k = texture2D(uDamp, vUv).rgb * uDampScale;
  vec3 z = zAt(vUv);
  // Wave equation with per-band impedance (reflection at walls, same speed)
  // and conductive loss (absorption): lib/wifi-replica is the 1D copy.
  vec3 lap = (pull(vec2(uTexel.x, 0.0), c.rgb, z) + pull(vec2(-uTexel.x, 0.0), c.rgb, z)
            + pull(vec2(0.0, uTexel.y), c.rgb, z) + pull(vec2(0.0, -uTexel.y), c.rgb, z)) / z;
  vec3 n = (2.0 * c.rgb - (vec3(1.0) - k) * p + uC2 * lap) / (vec3(1.0) + k);
  // Bands the selected generation doesn't use fade out.
  n *= mix(vec3(0.95), vec3(1.0), uActive);
  // Soft source: a small Gaussian at the modem, one frequency per band.
  vec2 d = (vUv - uSrc) / uTexel;
  float g = exp(-dot(d, d) / 4.0);
  n += uActive * sin(uOmega * uTime) * g * uAmp;
  // NaN / blow-up guard (NaN fails every comparison).
  bvec3 ok = lessThan(abs(n), vec3(6.0));
  n = vec3(ok.x ? n.x : 0.0, ok.y ? n.y : 0.0, ok.z ? n.z : 0.0);
  float e = mix(c.a, dot(n * n, uEnergy), 0.02);
  if (!(e >= 0.0 && e < 100.0)) e = 0.0;
  gl_FragColor = vec4(n, e);
}`

const VIEW_FRAG = /* glsl */ `
#define RING_CELLS ${RING_CELLS.toFixed(1)}
#define RING_SIGMA ${RING_SIGMA.toFixed(1)}
#define WAVE_C ${SIM_C.toFixed(3)}
uniform sampler2D uState;
uniform vec3 uActive;
uniform float uDensity;
uniform vec2 uSrc;
uniform vec2 uTexel;
uniform float uTime;
uniform vec3 uCol0;
uniform vec3 uCol1;
uniform vec3 uCol2;
uniform vec4 uApt;
varying vec2 vUv;

void main() {
  vec4 s = texture2D(uState, vUv);
  vec3 crest = max(s.rgb, vec3(0.0)) * uActive;
  // Soft knee: bright near the modem, clearly dimmer after each wall.
  vec3 v = vec3(1.0) - exp(-crest * 1.8);
  float bands = max(dot(uActive, vec3(1.0)), 1.0);
  vec3 col = (uCol0 * v.r + uCol1 * v.g + uCol2 * v.b) * (1.1 / (0.6 + 0.4 * bands));
  vec3 tint = (uCol0 * uActive.x + uCol1 * uActive.y + uCol2 * uActive.z) / bands;
  float heat = log(1.0 + max(s.a, 0.0) * 80.0);
  col += tint * heat * 0.06;
  // Data rings (see RING_CELLS), faded by the local signal energy.
  float r = length((vUv - uSrc) / uTexel);
  float spacing = RING_CELLS / max(uDensity, 0.05);
  float dd = (fract((r - uTime * WAVE_C) / spacing) - 0.5) * spacing;
  float ring = exp(-dd * dd / (2.0 * RING_SIGMA * RING_SIGMA));
  float reach = smoothstep(0.15, 1.6, heat) * smoothstep(3.0, 9.0, r);
  col += vec3(0.82, 0.96, 1.0) * ring * reach * 0.85;
  // Outside the apartment the field is shown dimmer.
  float inside = step(uApt.x, vUv.x) * step(vUv.x, uApt.z) * step(uApt.y, vUv.y) * step(vUv.y, uApt.w);
  col *= mix(0.35, 1.0, inside);
  vec3 base = mix(vec3(0.004, 0.008, 0.018), vec3(0.01, 0.02, 0.04), inside);
  gl_FragColor = vec4(base + col, 1.0);
  #include <colorspace_fragment>
}`

export default function WifiWaves({
  active,
  show,
  density,
  router,
  still,
  onReady,
  onError,
}: {
  active: Record<BandId, boolean>
  /** Bands drawn (all by default); hidden ones keep running, just unseen. */
  show: Record<BandId, boolean>
  /** 0–1: data-ring density (lib/wifi dataDensity). */
  density: number
  router: Pt
  still: boolean
  onReady?: () => void
  onError?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const api = useRef<{
    setInputs: (a: Record<BandId, boolean>, show: Record<BandId, boolean>, density: number, r: Pt) => void
    settle: () => void
  } | null>(null)
  const stillRef = useRef(still)
  const readyCb = useRef(onReady)
  const errorCb = useRef(onError)
  useEffect(() => {
    readyCb.current = onReady
    errorCb.current = onError
  }, [onReady, onError])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" })
    } catch {
      errorCb.current?.()
      return
    }
    if (!renderer.extensions.has("EXT_color_buffer_float") && !renderer.extensions.has("EXT_color_buffer_half_float")) {
      renderer.dispose()
      errorCb.current?.()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

    const rtOpts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    } as const
    let [prev, cur, next] = [0, 1, 2].map(() => new THREE.WebGLRenderTarget(SIM_W, SIM_H, rtOpts))
    renderer.setClearColor(0x000000, 0)
    for (const rt of [prev, cur, next]) {
      renderer.setRenderTarget(rt)
      renderer.clear()
    }
    renderer.setRenderTarget(null)

    const medium = buildMedium()
    const [dampTex, impTex] = [medium.damp, medium.imp].map((data) => {
      const tex = new THREE.DataTexture(data, SIM_W, SIM_H, THREE.RGBAFormat, THREE.UnsignedByteType)
      tex.minFilter = tex.magFilter = THREE.NearestFilter
      tex.needsUpdate = true
      return tex
    })

    const color = (b: BandId) => new THREE.Color(BANDS[b].color)
    const simMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: SIM_FRAG,
      uniforms: {
        uCur: { value: cur.texture },
        uPrev: { value: prev.texture },
        uDamp: { value: dampTex },
        uImp: { value: impTex },
        uTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
        uSrc: { value: new THREE.Vector2(0.5, 0.5) },
        uOmega: { value: new THREE.Vector3(bandOmega("b24"), bandOmega("b5"), bandOmega("b6")) },
        uActive: { value: new THREE.Vector3() },
        uEnergy: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uC2: { value: SIM_C * SIM_C },
        uDampScale: { value: DAMP_SCALE },
        uZSpan: { value: Z_MAX - 1 },
        uAmp: { value: 0.32 },
      },
      depthTest: false,
      depthWrite: false,
    })
    const [ax, ay] = toUv({ x: 0, y: APT.h })
    const [bx, by] = toUv({ x: APT.w, y: 0 })
    const viewMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: VIEW_FRAG,
      uniforms: {
        uState: { value: cur.texture },
        uActive: { value: new THREE.Vector3() },
        uDensity: { value: 1 },
        uSrc: { value: new THREE.Vector2(0.5, 0.5) },
        uTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
        uTime: { value: 0 },
        uCol0: { value: color("b24") },
        uCol1: { value: color("b5") },
        uCol2: { value: color("b6") },
        uApt: { value: new THREE.Vector4(ax, ay, bx, by) },
      },
      depthTest: false,
      depthWrite: false,
    })
    const scene = new THREE.Scene()
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat)
    quad.frustumCulled = false
    scene.add(quad)
    const camera = new THREE.Camera()

    const step = () => {
      simMat.uniforms.uCur.value = cur.texture
      simMat.uniforms.uPrev.value = prev.texture
      quad.material = simMat
      renderer.setRenderTarget(next)
      renderer.render(scene, camera)
      ;[prev, cur, next] = [cur, next, prev]
      simMat.uniforms.uTime.value += 1
    }
    let first = true
    const draw = () => {
      viewMat.uniforms.uState.value = cur.texture
      viewMat.uniforms.uTime.value = simMat.uniforms.uTime.value
      quad.material = viewMat
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
      if (first) {
        first = false
        requestAnimationFrame(() => readyCb.current?.())
      }
    }

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas
      if (w && h) renderer.setSize(w, h, false)
      if (stillRef.current) draw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let raf = 0
    let onScreen = false
    let warmed = false
    let last = 0
    let acc = 0
    const loop = (now: number) => {
      raf = 0
      if (!onScreen || stillRef.current || document.visibilityState !== "visible") return
      if (!warmed) {
        warmed = true
        for (let i = 0; i < WARM_STEPS; i++) step()
      }
      acc += last ? ((now - last) / 1000) * STEPS_PER_SECOND : 1
      last = now
      const n = Math.min(Math.floor(acc), MAX_STEPS_PER_FRAME)
      acc = Math.min(acc - n, 1)
      for (let i = 0; i < n; i++) step()
      draw()
      raf = requestAnimationFrame(loop)
    }
    const kick = () => {
      if (!raf && onScreen && !stillRef.current && document.visibilityState === "visible") {
        last = 0
        raf = requestAnimationFrame(loop)
      }
    }
    const settle = () => {
      for (let i = 0; i < STILL_STEPS; i++) step()
      draw()
    }

    api.current = {
      setInputs(a, show, density, r) {
        const on = new THREE.Vector3(+a.b24, +a.b5, +a.b6)
        const seen = new THREE.Vector3(+(a.b24 && show.b24), +(a.b5 && show.b5), +(a.b6 && show.b6))
        simMat.uniforms.uActive.value.copy(on)
        simMat.uniforms.uEnergy.value.copy(seen)
        viewMat.uniforms.uActive.value.copy(seen)
        viewMat.uniforms.uDensity.value = density
        simMat.uniforms.uSrc.value.set(...toUv(r))
        viewMat.uniforms.uSrc.value.set(...toUv(r))
      },
      settle() {
        if (stillRef.current) settle()
        else kick()
      },
    }

    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      kick()
    })
    io.observe(canvas)
    document.addEventListener("visibilitychange", kick)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener("visibilitychange", kick)
      api.current = null
      for (const rt of [prev, cur, next]) rt.dispose()
      dampTex.dispose()
      impTex.dispose()
      simMat.dispose()
      viewMat.dispose()
      quad.geometry.dispose()
      renderer.dispose()
    }
  }, [])

  // Runs after the setup effect above (same commit, declaration order), so the
  // first inputs reach the simulation too.
  useEffect(() => {
    stillRef.current = still
    api.current?.setInputs(active, show, density, router)
    api.current?.settle()
  }, [active, show, density, router, still])

  return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block h-full w-full" />
}
