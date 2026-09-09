/**
 * React JSX typings for the VietMap Optimize web components.
 *
 * Custom-element tags aren't known to React's JSX, so without this a React app
 * would have to declare them itself. Import this module ONCE (in your entry, or
 * the file that renders the planner) and the tags become valid JSX — no local
 * `declare module 'react'` needed:
 *
 * ```tsx
 * import '@vietmap/optimize-sdk-elements'        // registers the elements
 * import '@vietmap/optimize-sdk-elements/react'  // teaches React the tags
 *
 * <vietmap-optimize-planner ref={ref} api-key="…" tile-key="…" />
 * ```
 *
 * Data props (services / shipments / vehicles) are set imperatively through the
 * ref (`el.vehicles = …`), fully typed by the exported `VietmapOptimizePlanner`.
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// Re-export the whole SDK so a React app can pull its types from this same path.
export * from '@vietmap/optimize-sdk-elements'

type WebComponentProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>

/** JSX attributes for `<vietmap-optimize-planner>` (data goes through the ref). */
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

// React 19 reads intrinsic elements from `react`'s own JSX namespace.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'vietmap-optimize-planner': PlannerElementAttributes
      'vietmap-route-map': RouteMapElementAttributes
    }
  }
}

// React ≤18 (and TS's global JSX fallback) reads them from the global namespace.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'vietmap-optimize-planner': PlannerElementAttributes
      'vietmap-route-map': RouteMapElementAttributes
    }
  }
}
