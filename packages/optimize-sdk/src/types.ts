/**
 * Public type contracts for the Optimize SDK.
 *   1. SDK config / error plumbing.
 *   2. The Optimize (VROOM-style) request/response wire contract, modeled 1:1
 *      from https://fleetwork.vn/docs/sdk/optimize-api.
 *
 * Wire-contract field names are fixed by the backend — do NOT rename.
 * Conventions: coordinates are `[lon, lat]`, time is seconds, distance is
 * meters, time windows are `[start, end]` inclusive.
 */

// ─── SDK config & errors ─────────────────────────────────────────────────────

export type Locale = 'vi' | 'en'

export interface OptimizeClientConfig {
  /** Account API key — sent as the `X-API-Key` header on every request. */
  apiKey: string
  /** Override the API base URL. Defaults to `https://live.fleetwork.vn/api/v1`. */
  baseUrl?: string
  /** Request timeout in ms. @default 300000 (5 minutes) */
  timeoutMs?: number
  /** Called on 401/403 (invalid/expired key or no permission). */
  onAuthError?: (event: AuthErrorEvent) => void
  /** Custom `fetch` implementation (tests, Node < 18, or a polyfill). */
  fetch?: typeof fetch
}

/** Normalized error thrown by the SDK — a plain `Error` plus the HTTP status. */
export interface SdkError extends Error {
  status?: number
}

/** Emitted on 401/403. Surfaced via the client's `onAuthError` config or the
 *  React `<FleetworkProvider onAuthError>` prop. */
export interface AuthErrorEvent {
  status: 401 | 403
  message: string
  url?: string
  method?: string
  payload?: unknown
}

// ─── Optimize wire contract (VROOM-style) ────────────────────────────────────

/** `[longitude, latitude]`. */
export type Coordinate = [number, number]
/** `[start, end]` inclusive, seconds. */
export type TimeWindow = [number, number]
export type VehicleProfile = 'car' | 'truck' | 'motorcycle'
export type StepType = 'start' | 'job' | 'pickup' | 'delivery' | 'break' | 'end'

export interface Cost {
  fixed?: number
  per_hour?: number
  per_task_hour?: number
  per_km?: number
}

export interface Break {
  id: number
  time_windows?: TimeWindow[]
  service?: number
  description?: string
  max_load?: number[]
}

/** An independent delivery/pickup/visit task. */
export interface Job {
  id: number
  description?: string
  location?: Coordinate
  location_index?: number
  setup?: number
  service?: number
  setup_per_type?: Record<string, number>
  service_per_type?: Record<string, number>
  delivery?: number[]
  pickup?: number[]
  skills?: number[]
  priority?: number
  time_windows?: TimeWindow[]
}

export interface ShipmentStep {
  id: number
  description?: string
  location?: Coordinate
  location_index?: number
  setup?: number
  service?: number
  setup_per_type?: Record<string, number>
  service_per_type?: Record<string, number>
  time_windows?: TimeWindow[]
}

export interface Shipment {
  pickup: ShipmentStep
  delivery: ShipmentStep
  amount?: number[]
  skills?: number[]
  priority?: number
}

export interface VehicleStep {
  type: StepType
  id?: number
  service_at?: number
  service_after?: number
  service_before?: number
}

export interface Vehicle {
  id: number
  profile?: VehicleProfile
  description?: string
  start?: Coordinate
  start_index?: number
  end?: Coordinate
  end_index?: number
  capacity?: number[]
  costs?: Cost
  skills?: number[]
  type?: string
  time_window?: TimeWindow
  breaks?: Break[]
  speed_factor?: number
  max_tasks?: number
  max_travel_time?: number
  max_distance?: number
  steps?: VehicleStep[]
}

export interface Matrix {
  durations?: number[][]
  distances?: number[][]
  costs?: number[][]
}
export type Matrices = Record<string, Matrix>

/** Root optimize request. `vehicles` is required; provide at least one of
 *  `jobs` or `shipments`. */
export interface OptimizeRequest {
  jobs?: Job[]
  shipments?: Shipment[]
  vehicles: Vehicle[]
  matrices?: Matrices
}

export type ViolationCause =
  | 'delay'
  | 'lead_time'
  | 'load'
  | 'max_tasks'
  | 'skills'
  | 'precedence'
  | 'missing_break'
  | 'max_travel_time'
  | 'max_distance'
  | 'max_load'

export interface Violation {
  cause: ViolationCause
  duration?: number
}

export interface Step {
  type: StepType
  arrival: number
  duration: number
  setup?: number
  service?: number
  waiting_time?: number
  violations?: Violation[]
  description?: string
  location?: Coordinate
  location_index?: number
  id?: number
  load?: number[]
  distance?: number
}

export interface Route {
  vehicle: number
  steps: Step[]
  cost: number
  setup?: number
  service?: number
  duration: number
  waiting_time?: number
  priority?: number
  violations?: Violation[]
  delivery?: number[]
  pickup?: number[]
  description?: string
  geometry?: string
  distance?: number
}

export interface ComputingTimes {
  loading?: number
  solving?: number
  routing?: number
}

export interface Summary {
  cost: number
  routes: number
  unassigned: number
  setup?: number
  service?: number
  duration: number
  waiting_time?: number
  priority?: number
  violations?: Violation[]
  delivery?: number[]
  pickup?: number[]
  distance?: number
  computing_times?: ComputingTimes
}

export interface UnassignedTask {
  id: number
  type: StepType
  location?: Coordinate
  reason?: string
}

/** Root optimize response. `code === 0` = success; otherwise `error` carries the
 *  message (1=internal, 2=input, 3=routing). */
export interface OptimizeResponse {
  code: number
  error?: string
  summary: Summary
  unassigned: UnassignedTask[]
  routes: Route[]
}
