import type { Job, OptimizeRequest, Shipment, ShipmentStep, Vehicle } from './types'
import type { PlannerTask, PlannerVehicle } from './planner-types'

export interface BuiltRequest {
  request: OptimizeRequest
  /** Wire step id (a job id, or a shipment pickup/delivery id) -> the domain task + role. */
  stepIdToTask: Record<number, { taskKey: string; role: 'service' | 'pickup' | 'delivery' }>
  /** Wire vehicle id -> the domain vehicle key. */
  vehicleKeyByInt: Record<number, string>
}

/**
 * Map one day's domain tasks + vehicles into a single VROOM optimize request.
 *
 * Services and shipments are mapped to DIFFERENT wire arrays:
 *   - each {@link PlannerService} -> one `jobs[]` entry
 *   - each {@link PlannerShipment} -> one `shipments[]` entry (pickup + delivery)
 *
 * Every wire id (job id, pickup id, delivery id) is drawn from one shared
 * counter so it is globally unique — that lets `stepIdToTask` resolve any step
 * in the response back to its domain task and role unambiguously.
 */
export function buildRequest(tasks: PlannerTask[], vehicles: PlannerVehicle[]): BuiltRequest {
  const skillIds = new Map<string, number>()
  const skillOf = (name: string): number => {
    let id = skillIds.get(name)
    if (id == null) {
      id = skillIds.size + 1
      skillIds.set(name, id)
    }
    return id
  }
  const toSeconds = (minutes?: number): number => Math.round((minutes ?? 0) * 60)

  const stepIdToTask: BuiltRequest['stepIdToTask'] = {}
  const vehicleKeyByInt: Record<number, string> = {}
  const jobs: Job[] = []
  const shipments: Shipment[] = []
  let nextId = 1

  for (const t of tasks) {
    if (t.kind === 'shipment') {
      const pickupId = nextId++
      const deliveryId = nextId++
      stepIdToTask[pickupId] = { taskKey: String(t.id), role: 'pickup' }
      stepIdToTask[deliveryId] = { taskKey: String(t.id), role: 'delivery' }

      const pickup: ShipmentStep = {
        id: pickupId,
        description: t.pickup.name || t.name || `#${t.id} pickup`,
        location: t.pickup.location,
        service: toSeconds(t.pickup.serviceMinutes),
      }
      const delivery: ShipmentStep = {
        id: deliveryId,
        description: t.delivery.name || t.name || `#${t.id} delivery`,
        location: t.delivery.location,
        service: toSeconds(t.delivery.serviceMinutes),
      }
      const shipment: Shipment = { pickup, delivery }
      if (t.priority != null) shipment.priority = t.priority
      if (t.skills?.length) shipment.skills = t.skills.map(skillOf)
      if (t.amount) shipment.amount = t.amount
      shipments.push(shipment)
    } else {
      const id = nextId++
      stepIdToTask[id] = { taskKey: String(t.id), role: 'service' }
      const job: Job = {
        id,
        description: t.name || `#${t.id}`,
        location: t.location,
        service: toSeconds(t.serviceMinutes),
      }
      if (t.priority != null) job.priority = t.priority
      if (t.skills?.length) job.skills = t.skills.map(skillOf)
      if (t.amount) job.delivery = t.amount
      jobs.push(job)
    }
  }

  const wireVehicles: Vehicle[] = vehicles.map((v, i) => {
    const id = i + 1
    vehicleKeyByInt[id] = String(v.id)
    const vehicle: Vehicle = {
      id,
      description: v.name || v.plate || `#${v.id}`,
      profile: v.profile ?? 'car',
      start: v.start,
      end: v.end ?? v.start,
    }
    if (v.workingHours) vehicle.time_window = [v.workingHours[0] * 60, v.workingHours[1] * 60]
    if (v.skills?.length) vehicle.skills = v.skills.map(skillOf)
    if (v.capacity) vehicle.capacity = v.capacity
    return vehicle
  })

  const request: OptimizeRequest = { vehicles: wireVehicles }
  if (jobs.length) request.jobs = jobs
  if (shipments.length) request.shipments = shipments
  return { request, stepIdToTask, vehicleKeyByInt }
}
