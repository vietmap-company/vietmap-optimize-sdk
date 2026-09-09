export { VietmapOptimize } from './client'
export type { OptimizeCallOptions } from './client'
export { extractErrorMessage } from './errors'
export { formatDuration, formatDistance, formatArrival } from './format'
export type * from './types'

// Domain planner model (framework-agnostic) + request mapping.
export { buildRequest } from './build-request'
export type { BuiltRequest } from './build-request'
export { isService, isShipment, stopKey, classifyJob, classifyJobs } from './planner-types'
export type {
  LonLat,
  TaskKind,
  StopRole,
  PlannerService,
  PlannerShipment,
  PlannerShipmentPoint,
  PlannerTask,
  PlannerJobInput,
  PlannerVehicle,
  PlannerMember,
  RouteStop,
} from './planner-types'

// Headless planning controller — the auto-assign workflow with no UI (for
// consumers who don't want the web component).
export { OptimizePlannerController } from './planner-controller'
export type {
  PlannerState,
  VehicleStat,
  PlannerConfirmPayload,
  PlannerEventDetail,
  PlannerEventType,
  PlannerControllerOptions,
} from './planner-controller'
