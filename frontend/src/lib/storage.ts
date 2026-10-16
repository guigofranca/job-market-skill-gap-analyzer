/**
 * localStorage access that never throws (private mode, blocked storage, quota) - persisted values
 * are a convenience only, so the app must work identically when storage is unavailable.
 */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: keep the in-memory state only.
  }
}
