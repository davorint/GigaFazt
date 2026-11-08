"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { APT, BANDS, type BandId, type Pt } from "@/lib/wifi"
import { DAMP_SCALE, SIM_C, SIM_H, SIM_W, bandOmega, buildMask, toUv } from "@/lib/wifi-sim"

/**
 * GPU wave simulation for "Así viaja el Wi-Fi por tu depa" (lib/wifi-sim.ts):
 * a 2D wave equation stepped in a fragment shader (leapfrog, three ping-pong
 * half-float targets), R/G/B = 2.4/5/6 GHz fields, A = a slow energy average
 * for the coverage glow. Walls come from a mask texture (per-band damping +
 * slower wave speed, so they also reflect). Loaded only via next/dynamic from
 * WifiLab (three.js stays out of the initial bundle). Decorative: WifiLab
 * carries the text equivalent.
 *
 * Runs only while on screen and the tab is visible. `still` (reduced motion /
 * paused animations) renders one settled frame, re-rendered when inputs change.
 * Real-GPU safety (see the "Dentro de la fibra" fix): no pow() on signed
 * values, every field value is NaN-guarded and clamped.
 */

const STEPS_PER_FRAME = 3
const STILL_STEPS = 900

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`

const SIM_FRAG = /* glsl */ `
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform vec2 uSrc;
uniform vec3 uOmega;
uniform vec3 uActive;
uniform float uTime;
uniform float uC2;
uniform float uDampScale;
uniform float uAmp;
varying vec2 vUv;

void main() {
  vec4 c = texture2D(uCur, vUv);
  vec3 p = texture2D(uPrev, vUv).rgb;
  vec4 m = texture2D(uMask, vUv);
  vec3 lap = texture2D(uCur, vUv + vec2(uTexel.x, 0.0)).rgb
           + texture2D(uCur, vUv - vec2(uTexel.x, 0.0)).rgb
           + texture2D(uCur, vUv + vec2(0.0, uTexel.y)).rgb
           + texture2D(uCur, vUv - vec2(0.0, uTexel.y)).rgb
           - 4.0 * c.rgb;
  float s = m.a;
  vec3 n = 2.0 * c.rgb - p + uC2 * s * s * lap;
  n *= vec3(1.0) - m.rgb * uDampScale;
  // Bands the selected generation doesn't use fade out.
  n *= mix(vec3(0.95), vec3(1.0), uActive);
  // Soft source: a small Gaussian at the modem, one frequency per band.
  vec2 d = (vUv - uSrc) / uTexel;
  float g = exp(-dot(d, d) / 4.0);
  n += uActive * sin(uOmega * uTime) * g * uAmp;
  // NaN / blow-up guard (NaN fails every comparison).
  bvec3 ok = lessThan(abs(n), vec3(6.0));
  n = vec3(ok.x ? n.x : 0.0, ok.y ? n.y : 0.0, ok.z ? n.z : 0.0);
  float e = mix(c.a, dot(n * n, uActive), 0.02);
  if (!(e >= 0.0 && e < 100.0)) e = 0.0;
  gl_FragColor = vec4(n, e);
}`

const VIEW_FRAG = /* glsl */ `
uniform sampler2D uState;
uniform vec3 uActive;
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
  // Outside the apartment the field is shown dimmer.
  float inside = step(uApt.x, vUv.x) * step(vUv.x, uApt.z) * step(uApt.y, vUv.y) * step(vUv.y, uApt.w);
  col *= mix(0.35, 1.0, inside);
  vec3 base = mix(vec3(0.004, 0.008, 0.018), vec3(0.01, 0.02, 0.04), inside);
  gl_FragColor = vec4(base + col, 1.0);
  #include <colorspace_fragment>
}`

export default function WifiWaves({
  active,
  router,
  still,
  onReady,
  onError,
}: {
  active: Record<BandId, boolean>
  router: Pt
  still: boolean
  onReady?: () => void
  onError?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const api = useRef<{ setInputs: (a: Record<BandId, boolean>, r: Pt) => void; settle: () => void } | null>(null)
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

    const mask = new THREE.DataTexture(buildMask(), SIM_W, SIM_H, THREE.RGBAFormat, THREE.UnsignedByteType)
    mask.minFilter = mask.magFilter = THREE.NearestFilter
    mask.needsUpdate = true

    const color = (b: BandId) => new THREE.Color(BANDS[b].color)
    const simMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: SIM_FRAG,
      uniforms: {
        uCur: { value: cur.texture },
        uPrev: { value: prev.texture },
        uMask: { value: mask },
        uTexel: { value: new THREE.Vector2(1 / SIM_W, 1 / SIM_H) },
        uSrc: { value: new THREE.Vector2(0.5, 0.5) },
        uOmega: { value: new THREE.Vector3(bandOmega("b24"), bandOmega("b5"), bandOmega("b6")) },
        uActive: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uC2: { value: SIM_C * SIM_C },
        uDampScale: { value: DAMP_SCALE },
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
    const loop = () => {
      raf = 0
      if (!onScreen || stillRef.current || document.visibilityState !== "visible") return
      for (let i = 0; i < STEPS_PER_FRAME; i++) step()
      draw()
      raf = requestAnimationFrame(loop)
    }
    const kick = () => {
      if (!raf && onScreen && !stillRef.current && document.visibilityState === "visible") raf = requestAnimationFrame(loop)
    }
    const settle = () => {
      for (let i = 0; i < STILL_STEPS; i++) step()
      draw()
    }

    api.current = {
      setInputs(a, r) {
        const v = new THREE.Vector3(+a.b24, +a.b5, +a.b6)
        simMat.uniforms.uActive.value.copy(v)
        viewMat.uniforms.uActive.value.copy(v)
        simMat.uniforms.uSrc.value.set(...toUv(r))
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
      mask.dispose()
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
    api.current?.setInputs(active, router)
    api.current?.settle()
  }, [active, router, still])

  return <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block h-full w-full" />
}
