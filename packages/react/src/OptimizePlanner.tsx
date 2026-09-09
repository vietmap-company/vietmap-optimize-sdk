import { createElement, useEffect, useRef } from 'react'
import type { CSSProperties, ReactElement } from 'react'
// Side-effect: registers <vietmap-optimize-planner> / <vietmap-route-map>.
import '@vietmap/optimize-sdk-elements'
import type {
  VietmapOptimizePlanner,
  PlannerVehicle,
  PlannerService,
  PlannerShipment,
  PlannerTask,
  PlannerJobInput,
  PlannerConfirmPayload,
  StopRole,
} from '@vietmap/optimize-sdk-elements'

/** Convenience inputs that don't require the `kind` discriminator. */
type ServiceInput = Omit<PlannerService, 'kind'>
type ShipmentInput = Omit<PlannerShipment, 'kind'>

export interface OptimizePlannerProps {
  /** X-API-Key for the optimize API. */
  apiKey?: string
  baseUrl?: string
  /** VietMap map key for the basemap tiles. */
  tileKey?: string
  /** Selected day (`YYYY-MM-DD`). Changing it fires `onDayChange`. */
  day?: string
  /** Allow one vehicle to hold both services and shipments. @default true */
  allowMixed?: boolean
  /** @internal read-only "visualize" mode (optimize + view, no manual editing). */
  visualize?: boolean
  /** Vehicles (one row each). */
  vehicles?: PlannerVehicle[]
  /** Unified work list for the day — the SDK infers service vs shipment from
   *  each item's shape, so you can pass ONE list and skip the split. */
  jobs?: PlannerJobInput[]
  /** Pending services for the selected day (or use `jobs`). */
  services?: ServiceInput[]
  /** Pending shipments — pickup → delivery (or use `jobs`). */
  shipments?: ShipmentInput[]
  /** Full task union with explicit `kind` (or use `jobs`). */
  tasks?: PlannerTask[]

  /** The user picked a day; fetch that day's jobs and pass them back via props. */
  onDayChange?: (day: string) => void
  onOptimize?: (detail: { day: string; response: unknown }) => void
  onAssignmentChange?: (detail: { day: string; vehicleKey: string | null; taskKey: string }) => void
  onRetime?: (detail: { day: string; taskId: string; role: StopRole; arrival: number }) => void
  onConfirm?: (detail: PlannerConfirmPayload) => void

  className?: string
  style?: CSSProperties
}

/** Props reflected onto the element as JS properties (arrays/objects can't go
 *  through attributes). Kept in one place so the effect deps stay in sync. */
const ELEMENT_PROPS = [
  'apiKey', 'baseUrl', 'tileKey', 'day', 'allowMixed', 'visualize',
  'vehicles', 'jobs', 'services', 'shipments', 'tasks',
] as const

/**
 * `<OptimizePlanner>` — an idiomatic React wrapper around the
 * `<vietmap-optimize-planner>` web component. Pass `vehicles` + `services` /
 * `shipments` (and the keys) as props and it just works: the wrapper sets them
 * as element properties and forwards the custom events to `onXxx` callbacks, so
 * you never touch a ref.
 */
export function OptimizePlanner(props: OptimizePlannerProps): ReactElement {
  const ref = useRef<VietmapOptimizePlanner | null>(null)

  // Reflect data/config props onto the element (as properties, not attributes).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    for (const key of ELEMENT_PROPS) {
      const value = props[key]
      if (value !== undefined) (el as unknown as Record<string, unknown>)[key] = value
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.apiKey, props.baseUrl, props.tileKey, props.day, props.allowMixed, props.visualize, props.vehicles, props.jobs, props.services, props.shipments, props.tasks])

  // Forward the custom events to callback props.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const off: Array<() => void> = []
    const on = <T,>(type: string, cb?: (detail: T) => void) => {
      if (!cb) return
      const h = (e: Event) => cb((e as CustomEvent<T>).detail)
      el.addEventListener(type, h)
      off.push(() => el.removeEventListener(type, h))
    }
    on<{ day: string }>('vm-daychange', props.onDayChange && ((d) => props.onDayChange!(d.day)))
    on('vm-optimize', props.onOptimize)
    on('vm-assignmentchange', props.onAssignmentChange)
    on('vm-retime', props.onRetime)
    on('vm-confirm', props.onConfirm)
    return () => off.forEach((f) => f())
  }, [props.onDayChange, props.onOptimize, props.onAssignmentChange, props.onRetime, props.onConfirm])

  return createElement('vietmap-optimize-planner', {
    ref,
    className: props.className,
    style: props.style,
  })
}
