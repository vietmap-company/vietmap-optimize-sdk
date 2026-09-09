/**
 * Formatting helpers for optimize results (time in seconds, distance in meters).
 * Pure, dependency-free, exported for consumers rendering their own UI.
 */

/** Seconds -> "1h 20m" / "45m" / "30s". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return sec > 0 ? `${m}m ${sec}s` : `${m}m`
  return `${sec}s`
}

/** Meters -> "24.5 km" / "850 m". */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—'
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

/** A `step.arrival` value -> local clock "HH:MM". Values >= 1e9 are unix seconds. */
export function formatArrival(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value >= 1_000_000_000) {
    const d = new Date(value * 1000)
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const total = Math.round(value)
  const h = Math.floor(total / 3600) % 24
  const m = Math.floor((total % 3600) / 60)
  return `${pad(h)}:${pad(m)}`
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
