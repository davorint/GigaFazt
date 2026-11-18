"use client"

/**
 * A button that downloads a file built on the phone from what the list has (CSV for Excel). The name gets the date
 * when it is clicked: "<name>-YYYY-MM-DD.csv".
 */
export function ExportButton({ label, name, build, ext = "csv", type = "text/csv;charset=utf-8", disabled }: { label: string; name: string; build: () => string; ext?: string; type?: string; disabled?: boolean }) {
  const save = () => {
    const d = new Date()
    const filename = `${name}-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.${ext}`
    const url = URL.createObjectURL(new Blob([build()], { type }))
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return (
    <button
      type="button"
      onClick={save}
      disabled={disabled}
      className="inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
    >
      {label}
    </button>
  )
}
