export { FleetworkProvider, useFleetworkClient } from './FleetworkProvider'
export type { FleetworkProviderProps } from './FleetworkProvider'
export { useOptimize } from './useOptimize'
export type { UseOptimizeResult } from './useOptimize'

// Props-based React wrapper around the <vietmap-optimize-planner> web component.
export { OptimizePlanner } from './OptimizePlanner'
export type { OptimizePlannerProps } from './OptimizePlanner'

// Re-export the whole core so React users need only one import.
export * from '../index'

// --- Raw-tag JSX types (React) ---
// The recommended React API is <OptimizePlanner> above. These ambient types are
// for consumers who prefer to write the raw <vietmap-optimize-planner> tag in
// their own JSX (data still goes through a ref) — importing this entry makes the
// tags valid JSX with no local `declare module 'react'`.
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

type WebComponentProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>

/** JSX attributes for `<vietmap-optimize-planner>` (data props go via the ref). */
export type PlannerElementAttributes = WebComponentProps & {
  'api-key'?: string
  'base-url'?: string
  'tile-key'?: string
  day?: string
  'allow-mixed'?: boolean
}

/** JSX attributes for `<vietmap-route-map>`. */
export type RouteMapElementAttributes = WebComponentProps & {
  'tile-key'?: string
}

// React 19 reads intrinsic elements from react's own JSX namespace…
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'vietmap-optimize-planner': PlannerElementAttributes
      'vietmap-route-map': RouteMapElementAttributes
    }
  }
}
// …React ≤18 / the global JSX fallback reads them from the global namespace.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'vietmap-optimize-planner': PlannerElementAttributes
      'vietmap-route-map': RouteMapElementAttributes
    }
  }
}
