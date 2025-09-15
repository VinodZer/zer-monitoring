"use client"

import { useEffect } from "react"

export default function GlobalErrorGuard() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // Prevent uncaught errors from bubbling to dev overlays
      try {
        e.preventDefault()
      } catch (err) {
        // ignore
      }
      // Log for visibility
      // eslint-disable-next-line no-console
      console.warn("Suppressed window error:", e.message)
    }

    const onRejection = (e: PromiseRejectionEvent) => {
      try {
        e.preventDefault()
      } catch (err) {
        // ignore
      }
      // eslint-disable-next-line no-console
      console.warn("Suppressed unhandled rejection:", e.reason)
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)

    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  return null
}
