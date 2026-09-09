/**
 * Domain-level planner model (framework-agnostic). These friendly shapes are
 * what an app feeds the planner; `buildRequest()` maps them to the VROOM
 * jobs/shipments/vehicles wire contract for `/api/v1/optimize`.
 *
 * Services and shipments are kept SEPARATE, matching the backend contract:
 *   - a {@link PlannerService} is a single-location visit  -> a VROOM `job`
 *   - a {@link PlannerShipment} is a pickup->delivery pair -> a VROOM `shipment`
 *
 * Conventions mirror the wire contract: coordinates are `[lon, lat]`, time
 * windows are minutes-of-day here (converted to seconds by `buildRequest`).
 */

/** `[longitude, latitude]`. */
export type LonLat = [number, number]

export type TaskKind = 'service' | 'shipment'
export type StopRole = 'service' | 'pickup' | 'delivery'

/** A single-location task (visit / on-site service / one-off delivery). */
export interface PlannerService {
  id: string | number
  kind: 'service'
  name?: string
  /** Reference code shown on the card (else the id). */
  code?: string
  /** `[lon, lat]` of the visit. */
  location: LonLat
  /** Service duration in minutes. @default 0 */
  serviceMinutes?: number
  /** Priority 0-100 (higher = more likely to be served). */
  priority?: number
  /** Required skill names (a subset of the vehicle's skills). */
  skills?: string[]
  /** Capacity demand dropped at this stop (maps to VROOM `job.delivery`). */
  amount?: number[]
}

/** One leg (pickup or delivery) of a shipment. */
export interface PlannerShipmentPoint {
  /** `[lon, lat]` of this leg. */
  location: LonLat
  /** Service duration in minutes at this leg. @default 0 */
  serviceMinutes?: number
  /** Optional label/code for this leg. */
  name?: string
  code?: string
}

/** A pickup -> delivery pair carried by a single vehicle. */
export interface PlannerShipment {
  id: string | number
  kind: 'shipment'
  name?: string
  code?: string
  pickup: PlannerShipmentPoint
  delivery: PlannerShipmentPoint
  priority?: number
  skills?: string[]
  /** Load carried from pickup to delivery (maps to VROOM `shipment.amount`). */
  amount?: number[]
}

/** A unit of work — either a service or a shipment (discriminated by `kind`). */
export type PlannerTask = PlannerService | PlannerShipment

/** A vehicle (xe) that performs tasks. Vehicle-facing fields drive the UI. */
export interface PlannerVehicle {
  id: string | number
  /** Driver / vehicle label. */
  name?: string
  /** License plate (biển số) — shown prominently. */
  plate?: string
  /** Vehicle type (loại xe), e.g. "Xe tải 1.5T". */
  vehicleType?: string
  /** Capacity per dimension (tải trọng / thể tích), matched against task amounts. */
  capacity?: number[]
  /** `[lon, lat]` start (depot / current location). */
  start: LonLat
  /** `[lon, lat]` end. @default start */
  end?: LonLat
  /** `[startMinutes, endMinutes]` of the working day, e.g. `[480, 1080]` = 08:00–18:00. */
  workingHours?: [number, number]
  skills?: string[]
  /** Work areas shown as chips. */
  cities?: string[]
  /** Routing profile. @default 'car' */
  profile?: 'car' | 'truck' | 'motorcycle'
  /** Route color override; else auto-assigned from the palette. */
  color?: string
  /** Avatar initials (else derived from plate/name). */
  avatarText?: string
}

/** @deprecated Renamed to {@link PlannerVehicle}; kept as an alias for compatibility. */
export type PlannerMember = PlannerVehicle

/** A resolved stop inside a vehicle's route (from an optimize response or manual state). */
export interface RouteStop {
  taskKey: string
  role: StopRole
  /** Arrival time in seconds (as returned by the API); `undefined` before optimize. */
  arrival?: number
  /** `[lon, lat]` of the stop. */
  location?: LonLat
}

/** Narrow a task to a shipment. */
export function isShipment(t: PlannerTask): t is PlannerShipment {
  return t.kind === 'shipment'
}
/** Narrow a task to a service. */
export function isService(t: PlannerTask): t is PlannerService {
  return t.kind === 'service'
}

/**
 * A job WITHOUT the `kind` discriminator — the SDK infers service vs shipment
 * from the shape, so consumers can pass a single `jobs` list and skip the split.
 */
export type PlannerJobInput = Omit<PlannerService, 'kind'> | Omit<PlannerShipment, 'kind'>

/** True when a value is a shipment step: an object carrying a `location`. */
function isLocationStep(x: unknown): x is PlannerShipmentPoint {
  return !!x && typeof x === 'object' && !Array.isArray(x) && Array.isArray((x as { location?: unknown }).location)
}

/**
 * Infer a job's kind from its shape, matching VROOM's own job/shipment split:
 * a shipment gives `pickup` AND `delivery` as `{ location }` steps, so a job may
 * still carry `pickup`/`delivery` AMOUNT arrays (VROOM job quantities) and stay
 * a single-location service. An explicit `kind`, if present, is respected.
 */
export function classifyJob(job: PlannerJobInput): PlannerTask {
  const j = job as { kind?: TaskKind; pickup?: unknown; delivery?: unknown }
  if (j.kind === 'service' || j.kind === 'shipment') return job as PlannerTask
  if (isLocationStep(j.pickup) && isLocationStep(j.delivery)) {
    return { ...(job as Omit<PlannerShipment, 'kind'>), kind: 'shipment' }
  }
  return { ...(job as Omit<PlannerService, 'kind'>), kind: 'service' }
}

/** Classify a whole list of raw jobs into tasks (see {@link classifyJob}). */
export function classifyJobs(jobs: PlannerJobInput[]): PlannerTask[] {
  return jobs.map(classifyJob)
}

/**
 * Stable key for a stop within a task. A service has a single stop keyed by the
 * task key itself; a shipment has two stops keyed `${taskKey}:pickup` and
 * `${taskKey}:delivery`.
 */
export function stopKey(taskKey: string, role: StopRole): string {
  return role === 'service' ? taskKey : `${taskKey}:${role}`
}
