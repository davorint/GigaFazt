/**
 * Errors while rendering a page or running a route on the server go to lib/errors/server.ts (logged, and sent to the
 * team's alert channel when one is set). Only on the Node.js runtime, where the database and the alert helpers run.
 */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routeType: string; routePath?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { reportError } = await import("./lib/errors/server")
  const e = err as { message?: string; digest?: string }
  await reportError({ source: "server", message: e?.message ?? String(err), path: request.path, digest: e?.digest, detail: `${request.method} · ${context.routeType}${context.routePath ? ` · ${context.routePath}` : ""}` }).catch(() => undefined)
}
