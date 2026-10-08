import { useEffect, useState } from 'react'

export function useSavedState<T>(key: string, initial: T) {
  const storageKey = 'runway-v2:' + key
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw === null ? initial : JSON.parse(raw) as T
    } catch { return initial }
  })
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)) }
    catch { window.dispatchEvent(new Event('workspace-storage-error')) }
  }, [storageKey, value])
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return
      try { setValue(JSON.parse(event.newValue) as T) } catch { /* Preserve current state if another tab writes invalid JSON. */ }
    }
    window.addEventListener('storage', receive)
    return () => window.removeEventListener('storage', receive)
  }, [storageKey])
  return [value, setValue] as const
}

export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
