"use client"

import { Component, type ReactNode } from "react"

/** Shared by the hero and "Simetría en luz" WebGL islands. */
export function canUseWebGL(): boolean {
  try {
    const c = document.createElement("canvas")
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    )
  } catch {
    return false
  }
}

/** If the WebGL scene throws, swallow it and keep the poster (hard rule #9: the
 *  poster is the text-equivalent static frame anyway). */
export class SceneBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
