import { VietmapOptimize } from './client'
import type { OptimizeCallOptions } from './client'
import type { OptimizeResponse, SdkError } from './types'
import { buildRequest } from './build-request'
import { stopKey } from './planner-types'
import type { PlannerTask, PlannerVehicle, RouteStop, StopRole, TaskKind } from './planner-types'

/** Recover the task key from a stop key (`taskKey`, `taskKey:pickup`, `taskKey:delivery`). */
function taskKeyOfStopKey(sk: string): string {
  if (sk.endsWith(':pickup')) return sk.slice(0, -':pickup'.length)
  if (sk.endsWith(':delivery')) return sk.slice(0, -':delivery'.length)
  return sk
}

/** Per-vehicle route summary produced by the last optimize run. */
export interface VehicleStat {
  distance?: number
  duration: number
}

/** The full planning state. Read it via {@link OptimizePlannerController.state}. */
export interface PlannerState {
  /** The single selected day, ISO `yyyy-mm-dd`. */
  day: string
  tasks: PlannerTask[]
  vehicles: PlannerVehicle[]
  /** vehicleKey -> ordered task keys assigned to that vehicle. */
  assignment: Record<string, string[]>
  /** task keys not assigned to any vehicle. */
  unassigned: string[]
  /** stopKey (`taskKey` for a service, `taskKey:pickup` / `taskKey:delivery`) -> arrival seconds. */
  arrivals: Record<string, number>
  /** task key -> unassigned reason from the last optimize run. */
  reasons: Record<string, string>
  /** vehicleKey -> route stats from the last optimize run. */
  stats: Record<string, VehicleStat>
  loading: boolean
  error: string
  /** The raw response from the last successful optimize run. */
  response?: OptimizeResponse
}

export interface PlannerConfirmPayload {
  day: string
  assignment: Record<string, string[]>
  unassigned: string[]
  arrivals: Record<string, number>
}

/** Detail payload for each named event, keyed by event type. */
export interface PlannerEventDetail {
  daychange: { day: string }
  optimize: { response: OptimizeResponse }
  assignmentchange: { assignment: Record<string, string[]>; unassigned: string[] }
  retime: { taskKey: string; role: StopRole; arrival: number }
  confirm: PlannerConfirmPayload
  /** Fires after every state mutation; the detail is the current state. */
  change: Readonly<PlannerState>
}
export type PlannerEventType = keyof PlannerEventDetail

export interface PlannerControllerOptions {
  /** Use an existing client. If given, `apiKey`/`baseUrl` are ignored. */
  client?: VietmapOptimize
  /** API key for an internally-created client (sent as `X-API-Key`). */
  apiKey?: string
  /** Override the API base URL for an internally-created client. */
  baseUrl?: string
  /** Initial selected day, ISO `yyyy-mm-dd`. @default today */
  day?: string
  tasks?: PlannerTask[]
  vehicles?: PlannerVehicle[]
}

function p2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}
function isoToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/**
 * Framework-agnostic, headless planning controller — the whole auto-assign
 * workflow (pick a day, drag/assign tasks to vehicles, optimize, retime,
 * confirm) with NO UI. Consumers who don't want the `<vietmap-optimize-planner>`
 * web component drive their own UI against this class:
 *
 * ```ts
 * const planner = new OptimizePlannerController({ apiKey: 'KEY' })
 * planner.on('daychange', ({ day }) => fetchMyJobs(day).then((t) => planner.setTasks(t)))
 * planner.setVehicles(myVehicles)
 * planner.subscribe((state) => renderMyBoard(state))
 * planner.setDay('2026-09-08')
 * await planner.optimize()
 * ```
 *
 * The `<vietmap-optimize-planner>` element is itself a thin view over this
 * controller, so the UI and headless paths never drift.
 */
export class OptimizePlannerController {
  private _state: PlannerState
  private _client?: VietmapOptimize
  private _injectedClient?: VietmapOptimize
  private _apiKey: string
  private _baseUrl?: string
  private _subscribers = new Set<(state: Readonly<PlannerState>) => void>()
  private _handlers = new Map<PlannerEventType, Set<(detail: unknown) => void>>()

  constructor(options: PlannerControllerOptions = {}) {
    this._injectedClient = options.client
    this._apiKey = options.apiKey ?? ''
    this._baseUrl = options.baseUrl
    this._state = {
      day: options.day || isoToday(),
      tasks: options.tasks ? [...options.tasks] : [],
      vehicles: options.vehicles ? [...options.vehicles] : [],
      assignment: {},
      unassigned: [],
      arrivals: {},
      reasons: {},
      stats: {},
      loading: false,
      error: '',
      response: undefined,
    }
    this._reconcile({ freshTasks: true })
  }

  // ─── reads ─────────────────────────────────────────────────────────────────

  /** The current planning state (live object — treat as read-only). */
  get state(): Readonly<PlannerState> {
    return this._state
  }

  taskByKey(key: string): PlannerTask | undefined {
    return this._state.tasks.find((t) => String(t.id) === key)
  }
  vehicleByKey(key: string): PlannerVehicle | undefined {
    return this._state.vehicles.find((v) => String(v.id) === key)
  }

  /**
   * The ordered stops for one vehicle: a service contributes one stop, a
   * shipment two (pickup then delivery). Sorted by arrival once optimized.
   */
  stopsForVehicle(vehicleKey: string): RouteStop[] {
    const stops: RouteStop[] = []
    for (const taskKey of this._state.assignment[vehicleKey] ?? []) {
      const t = this.taskByKey(taskKey)
      if (!t) continue
      if (t.kind === 'shipment') {
        stops.push({ taskKey, role: 'pickup', arrival: this._state.arrivals[stopKey(taskKey, 'pickup')], location: t.pickup.location })
        stops.push({ taskKey, role: 'delivery', arrival: this._state.arrivals[stopKey(taskKey, 'delivery')], location: t.delivery.location })
      } else {
        stops.push({ taskKey, role: 'service', arrival: this._state.arrivals[taskKey], location: t.location })
      }
    }
    stops.sort((a, b) => (a.arrival ?? Number.POSITIVE_INFINITY) - (b.arrival ?? Number.POSITIVE_INFINITY))
    return stops
  }

  // ─── inputs ──────────────────────────────────────────────────────────────

  /** Select the single active day and emit `daychange` so callers can fetch that day's tasks. */
  setDay(day: string): void {
    if (!day || day === this._state.day) return
    this._state.day = day
    this._emit('daychange', { day })
    this._changed()
  }

  /** Replace the day's tasks (e.g. after fetching them for the selected day). Clears prior results. */
  setTasks(tasks: PlannerTask[]): void {
    this._state.tasks = [...tasks]
    this._state.arrivals = {}
    this._state.reasons = {}
    this._state.stats = {}
    this._state.response = undefined
    this._reconcile({ freshTasks: true })
    this._emit('assignmentchange', { assignment: this._state.assignment, unassigned: this._state.unassigned })
    this._changed()
  }

  /** Replace the vehicles. Existing assignments are preserved where still valid. */
  setVehicles(vehicles: PlannerVehicle[]): void {
    this._state.vehicles = [...vehicles]
    this._reconcile({ freshTasks: false })
    this._emit('assignmentchange', { assignment: this._state.assignment, unassigned: this._state.unassigned })
    this._changed()
  }

  /** Update the API key of the internally-created client (no effect on an injected client). */
  setApiKey(apiKey: string): void {
    this._apiKey = apiKey ?? ''
    this._client = undefined
  }
  setBaseUrl(baseUrl?: string): void {
    this._baseUrl = baseUrl
    this._client = undefined
  }

  // ─── manual assignment ─────────────────────────────────────────────────────

  /** Assign a task to a vehicle (removing it from wherever it was). */
  assign(taskKey: string, vehicleKey: string): void {
    this.move(taskKey, vehicleKey)
  }
  /** Send a task back to the unassigned pool. */
  unassign(taskKey: string): void {
    this.move(taskKey, null)
  }
  /** Move a task to a vehicle, or to the unassigned pool when `vehicleKey` is null. */
  move(taskKey: string, vehicleKey: string | null): void {
    if (!taskKey) return
    const assignment: Record<string, string[]> = {}
    for (const [vk, keys] of Object.entries(this._state.assignment)) {
      assignment[vk] = keys.filter((k) => k !== taskKey)
    }
    let unassigned = this._state.unassigned.filter((k) => k !== taskKey)
    if (vehicleKey === null) {
      unassigned = [...unassigned, taskKey]
    } else {
      if (!assignment[vehicleKey]) assignment[vehicleKey] = []
      assignment[vehicleKey] = [...assignment[vehicleKey], taskKey]
    }
    this._state.assignment = assignment
    this._state.unassigned = unassigned
    // A manual move invalidates this task's optimized arrival(s).
    this._clearArrivals(taskKey)
    this._emit('assignmentchange', { assignment, unassigned })
    this._changed()
  }

  /** Clear all assignments back to the unassigned pool. */
  clearAssignments(): void {
    const assignment: Record<string, string[]> = {}
    for (const v of this._state.vehicles) assignment[String(v.id)] = []
    this._state.assignment = assignment
    this._state.unassigned = this._state.tasks.map((t) => String(t.id))
    this._state.arrivals = {}
    this._emit('assignmentchange', { assignment, unassigned: this._state.unassigned })
    this._changed()
  }

  // ─── retime ────────────────────────────────────────────────────────────────

  /**
   * Set the arrival (seconds) for one stop of a task. For a shipment the pickup
   * is clamped to be no later than the delivery (and vice versa).
   */
  retime(taskKey: string, role: StopRole, arrival: number): void {
    const arrivals = { ...this._state.arrivals }
    let value = Math.max(0, Math.round(arrival))
    const task = this.taskByKey(taskKey)
    if (task?.kind === 'shipment') {
      const pickup = arrivals[stopKey(taskKey, 'pickup')]
      const delivery = arrivals[stopKey(taskKey, 'delivery')]
      if (role === 'pickup' && delivery != null) value = Math.min(value, delivery)
      if (role === 'delivery' && pickup != null) value = Math.max(value, pickup)
    }
    arrivals[stopKey(taskKey, role)] = value
    this._state.arrivals = arrivals
    this._emit('retime', { taskKey, role, arrival: value })
    this._changed()
  }

  // ─── optimize ────────────────────────────────────────────────────────────

  /**
   * Solve the day: map current tasks + vehicles to `/api/v1/optimize`, then
   * fold the response back into the assignment / arrivals / stats state.
   * Sets `state.error` and rethrows on failure.
   */
  async optimize(options?: OptimizeCallOptions & { kinds?: TaskKind[] }): Promise<OptimizeResponse> {
    const { tasks, vehicles } = this._state
    const kinds = options?.kinds
    // Scope the solve to the requested task kinds (e.g. only shipments); the
    // other kinds' existing assignment is preserved (merged), not re-solved.
    const subset = kinds ? tasks.filter((t) => kinds.includes(t.kind)) : tasks
    if (!vehicles.length) {
      const msg = 'Chưa có xe'
      this._state.error = msg
      this._changed()
      throw new Error(msg)
    }
    if (!subset.length) {
      const msg = 'Không có công việc để tối ưu'
      this._state.error = msg
      this._changed()
      throw new Error(msg)
    }

    this._state.loading = true
    this._state.error = ''
    this._changed()
    try {
      const { request, stepIdToTask, vehicleKeyByInt } = buildRequest(subset, vehicles)
      const res = await this.client().optimize(request, { signal: options?.signal })

      const solvedAssign: Record<string, string[]> = {}
      for (const v of vehicles) solvedAssign[String(v.id)] = []
      const solvedArrivals: Record<string, number> = {}
      const solvedStats: Record<string, VehicleStat> = {}
      const solvedReasons: Record<string, string> = {}
      const assigned = new Set<string>()

      for (const route of res.routes ?? []) {
        const vehicleKey = vehicleKeyByInt[route.vehicle]
        if (!vehicleKey) continue
        if (!solvedAssign[vehicleKey]) solvedAssign[vehicleKey] = []
        solvedStats[vehicleKey] = { distance: route.distance, duration: route.duration }
        for (const step of route.steps ?? []) {
          if (step.id == null) continue
          if (step.type !== 'job' && step.type !== 'pickup' && step.type !== 'delivery') continue
          const map = stepIdToTask[step.id]
          if (!map) continue
          solvedArrivals[stopKey(map.taskKey, map.role)] = step.arrival
          if (!solvedAssign[vehicleKey].includes(map.taskKey)) solvedAssign[vehicleKey].push(map.taskKey)
          assigned.add(map.taskKey)
        }
      }

      const solvedUnassigned: string[] = []
      for (const u of res.unassigned ?? []) {
        const map = stepIdToTask[u.id]
        if (!map || assigned.has(map.taskKey)) continue
        if (!solvedUnassigned.includes(map.taskKey)) solvedUnassigned.push(map.taskKey)
        if (u.reason) solvedReasons[map.taskKey] = u.reason
      }
      // Any solved-subset task the solver mentioned in neither bucket → unassigned.
      for (const t of subset) {
        const k = String(t.id)
        if (!assigned.has(k) && !solvedUnassigned.includes(k)) solvedUnassigned.push(k)
      }

      if (kinds) {
        // Merge: keep everything OUTSIDE the solved subset, replace the subset.
        const inSubset = new Set(subset.map((t) => String(t.id)))
        const keepTask = (taskKey: string) => !inSubset.has(taskKey)
        const assignment: Record<string, string[]> = {}
        for (const v of vehicles) {
          const vk = String(v.id)
          assignment[vk] = [...(this._state.assignment[vk] ?? []).filter(keepTask), ...(solvedAssign[vk] ?? [])]
        }
        const unassigned = [...this._state.unassigned.filter(keepTask), ...solvedUnassigned]
        const arrivals: Record<string, number> = {}
        for (const [sk, val] of Object.entries(this._state.arrivals)) if (keepTask(taskKeyOfStopKey(sk))) arrivals[sk] = val
        Object.assign(arrivals, solvedArrivals)
        const reasons: Record<string, string> = {}
        for (const [tk, r] of Object.entries(this._state.reasons)) if (keepTask(tk)) reasons[tk] = r
        Object.assign(reasons, solvedReasons)
        this._state.assignment = assignment
        this._state.unassigned = unassigned
        this._state.arrivals = arrivals
        this._state.reasons = reasons
        this._state.stats = { ...this._state.stats, ...solvedStats }
      } else {
        this._state.assignment = solvedAssign
        this._state.unassigned = solvedUnassigned
        this._state.arrivals = solvedArrivals
        this._state.reasons = solvedReasons
        this._state.stats = solvedStats
      }
      this._state.response = res
      this._state.loading = false
      this._emit('optimize', { response: res })
      this._emit('assignmentchange', { assignment: this._state.assignment, unassigned: this._state.unassigned })
      this._changed()
      return res
    } catch (e) {
      this._state.loading = false
      this._state.error = (e as SdkError)?.message ?? 'Tối ưu thất bại'
      this._changed()
      throw e
    }
  }

  /** Snapshot the current plan for the day and emit `confirm`. */
  confirm(): PlannerConfirmPayload {
    const payload: PlannerConfirmPayload = {
      day: this._state.day,
      assignment: this._state.assignment,
      unassigned: this._state.unassigned,
      arrivals: this._state.arrivals,
    }
    this._emit('confirm', payload)
    return payload
  }

  // ─── events ────────────────────────────────────────────────────────────────

  /** Subscribe to every state change. Returns an unsubscribe function. */
  subscribe(listener: (state: Readonly<PlannerState>) => void): () => void {
    this._subscribers.add(listener)
    return () => this._subscribers.delete(listener)
  }

  /** Listen for one named event. Returns an unsubscribe function. */
  on<T extends PlannerEventType>(type: T, handler: (detail: PlannerEventDetail[T]) => void): () => void {
    let set = this._handlers.get(type)
    if (!set) {
      set = new Set()
      this._handlers.set(type, set)
    }
    set.add(handler as (detail: unknown) => void)
    return () => set!.delete(handler as (detail: unknown) => void)
  }

  /** Drop all listeners. */
  destroy(): void {
    this._subscribers.clear()
    this._handlers.clear()
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private client(): VietmapOptimize {
    if (this._injectedClient) return this._injectedClient
    if (!this._client) this._client = new VietmapOptimize({ apiKey: this._apiKey, baseUrl: this._baseUrl })
    return this._client
  }

  private _clearArrivals(taskKey: string): void {
    const arrivals = { ...this._state.arrivals }
    delete arrivals[taskKey]
    delete arrivals[stopKey(taskKey, 'pickup')]
    delete arrivals[stopKey(taskKey, 'delivery')]
    this._state.arrivals = arrivals
  }

  /** Rebuild assignment/unassigned so they stay consistent with tasks + vehicles. */
  private _reconcile(opts: { freshTasks: boolean }): void {
    const taskKeys = new Set(this._state.tasks.map((t) => String(t.id)))
    const vehicleKeys = new Set(this._state.vehicles.map((v) => String(v.id)))
    const assignment: Record<string, string[]> = {}
    for (const v of this._state.vehicles) assignment[String(v.id)] = []
    const seen = new Set<string>()

    if (!opts.freshTasks) {
      for (const [vk, keys] of Object.entries(this._state.assignment)) {
        if (!vehicleKeys.has(vk)) continue
        for (const k of keys) {
          if (taskKeys.has(k) && !seen.has(k)) {
            assignment[vk].push(k)
            seen.add(k)
          }
        }
      }
    }

    const unassigned: string[] = []
    for (const t of this._state.tasks) {
      const k = String(t.id)
      if (!seen.has(k)) unassigned.push(k)
    }
    // Prune stats for vehicles that no longer exist.
    const stats: Record<string, VehicleStat> = {}
    for (const [vk, s] of Object.entries(this._state.stats)) {
      if (vehicleKeys.has(vk)) stats[vk] = s
    }

    this._state.assignment = assignment
    this._state.unassigned = unassigned
    this._state.stats = stats
  }

  private _emit<T extends PlannerEventType>(type: T, detail: PlannerEventDetail[T]): void {
    const set = this._handlers.get(type)
    if (set) for (const h of [...set]) (h as (d: PlannerEventDetail[T]) => void)(detail)
  }

  private _changed(): void {
    this._emit('change', this._state)
    for (const listener of [...this._subscribers]) listener(this._state)
  }
}
