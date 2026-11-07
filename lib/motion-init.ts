/** Shared by lib/motion.ts (client) and the layout (server): no React imports. */
export const MOTION_KEY = "motion"

/** Inline, pre-paint: apply a stored "pause animations" choice before any animation starts. */
export const MOTION_INIT_SCRIPT = `try{if(localStorage.getItem("${MOTION_KEY}")==="off")document.documentElement.dataset.motion="off"}catch(e){}`
