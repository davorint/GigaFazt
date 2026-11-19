import type { Metadata } from "next"
import { OfflineApp } from "@/components/interno/OfflineApp"

/** Every /interno page: installable on the phone (manifest) and opening without signal once visited (OfflineApp). */
export const metadata: Metadata = { manifest: "/manifest-interno.webmanifest" }

export default function InternoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <OfflineApp />
    </>
  )
}
