import type { Metadata } from "next"
import { OfflineApp } from "@/components/interno/OfflineApp"
import { SessionGuard } from "@/components/interno/SessionGuard"

/**
 * Every /interno page: installable on the phone (manifest), opening without signal once visited (OfflineApp), and sent
 * to the sign-in when the server no longer accepts its session (SessionGuard).
 */
export const metadata: Metadata = { manifest: "/manifest-interno.webmanifest" }

export default function InternoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <OfflineApp />
      <SessionGuard />
    </>
  )
}
