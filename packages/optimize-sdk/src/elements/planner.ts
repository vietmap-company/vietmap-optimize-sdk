import { LitElement, html, css, svg, nothing } from 'lit'
import type { PropertyValues, TemplateResult } from 'lit'
import {
  OptimizePlannerController,
  stopKey,
  classifyJobs,
  formatArrival,
  formatDuration,
  formatDistance,
} from '../index'
import type {
  PlannerService,
  PlannerShipment,
  PlannerTask,
  PlannerJobInput,
  PlannerVehicle,
  RouteStop,
  StopRole,
} from '../index'
import './route-map'
import type { MapRoute, MapStop } from './route-map'

const ROUTE_COLORS = [
  '#EF4444', '#3B82F6', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
]
const ROLE_LABEL: Record<StopRole, string> = { service: 'Dịch vụ', pickup: 'Lấy hàng', delivery: 'Giao hàng' }
const ROLE_COLOR: Record<StopRole, string> = { service: '#0891b2', pickup: '#7c3aed', delivery: '#db2777' }

/** Inlined Lucide icon glyphs (24×24, stroke = currentColor). */
const ICON = {
  sparkles: svg`<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>`,
  check: svg`<path d="M20 6 9 17l-5-5"/>`,
  x: svg`<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
  calendar: svg`<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>`,
  truck: svg`<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>`,
  package: svg`<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>`,
  clock: svg`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`,
  user: svg`<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  mapPin: svg`<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>`,
  alert: svg`<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`,
  map: svg`<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>`,
  arrowUp: svg`<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>`,
  arrowDown: svg`<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>`,
  wrench: svg`<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`,
  chevronLeft: svg`<path d="m15 18-6-6 6-6"/>`,
  chevronRight: svg`<path d="m9 18 6-6-6-6"/>`,
} as const

function icon(name: keyof typeof ICON, size = 16): TemplateResult {
  return html`<svg class="ic" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`
}

const ROLE_ICON: Record<StopRole, keyof typeof ICON> = { service: 'wrench', pickup: 'arrowUp', delivery: 'arrowDown' }

/** Convenience inputs that don't require the `kind` discriminator. */
type ServiceInput = Omit<PlannerService, 'kind'>
type ShipmentInput = Omit<PlannerShipment, 'kind'>

function p2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}
function hhmm(minutes: number): string {
  return `${p2(Math.floor(minutes / 60))}:${p2(minutes % 60)}`
}
function initials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const a = parts[0]?.[0] ?? ''
  const b = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (a + b).toUpperCase() || '?'
}
function secOfDay(arrival: number): number {
  return arrival >= 1_000_000_000 ? arrival % 86400 : arrival
}
/** Timeline seconds-of-day for a stop; before optimize (no arrival) fall back to
 *  a per-role slot so a shipment's pickup sits before its delivery. */
const BAR_FALLBACK_SEC: Record<StopRole, number> = { pickup: 8 * 3600, service: 8 * 3600 + 1800, delivery: 9 * 3600 }
function barSec(stop: RouteStop): number {
  return stop.arrival != null ? secOfDay(stop.arrival) : BAR_FALLBACK_SEC[stop.role]
}
const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
function parseISO(s: string): Date {
  const [y, m, d] = (s || '').split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1)
}
function toISO(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
function fmtDMY(iso: string): string {
  const d = parseISO(iso)
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`
}
/** 6 weeks × 7 days (Sunday-first) covering `month` (0-based). */
function monthMatrix(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const out: Date[] = []
  for (let i = 0; i < 42; i++) out.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  return out
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * `<vietmap-optimize-planner>` — a framework-agnostic dispatcher board built on
 * the public `/api/v1/optimize` contract. It is a thin view over the headless
 * {@link OptimizePlannerController}: pick ONE day (emitted via `vm-daychange` so
 * the host fetches that day's jobs), see one row per VEHICLE, drag services and
 * shipments (kept in separate pools) onto vehicles, optimize, and confirm. The
 * map below (toggleable via the "Bản đồ" button, on by default) shows the
 * points; entering a VietMap key swaps in the tiles.
 *
 * Inputs: `.services` + `.shipments` (or a combined `.tasks`) + `.vehicles`.
 * Attributes: `api-key`, `base-url`, `tile-key`, `day`.
 * Events: `vm-daychange` / `vm-optimize` / `vm-assignmentchange` / `vm-retime` / `vm-confirm`.
 */
export class VietmapOptimizePlanner extends LitElement {
  static properties = {
    apiKey: { type: String, attribute: 'api-key' },
    baseUrl: { type: String, attribute: 'base-url' },
    tileKey: { type: String, attribute: 'tile-key' },
    day: { type: String },
    allowMixed: { type: Boolean, attribute: 'allow-mixed' },
    visualize: { type: Boolean, reflect: true },
    tasks: { attribute: false },
    jobs: { attribute: false },
    services: { attribute: false },
    shipments: { attribute: false },
    vehicles: { attribute: false },
    members: { attribute: false },
    _overId: { state: true },
    _detailVehicleId: { state: true },
    _hiddenRoutes: { state: true },
    _colorOverride: { state: true },
    _keyDraft: { state: true },
    _showMap: { state: true },
    _calOpen: { state: true },
    _calMonth: { state: true },
    _activeTab: { state: true },
  }

  apiKey = ''
  baseUrl?: string
  tileKey = ''
  day = ''
  /** Allow one vehicle to hold BOTH services and shipments (tabs just filter the
   *  view). When false, each tab is an independent per-type plan. @default true */
  allowMixed = true
  /** Visualize-only mode (DEFAULT): users can optimize and open the detail view,
   *  but all manual editing (drag-to-assign, retime, confirm) is disabled. Set
   *  `visualize = false` (property) to enable manual editing. @default true */
  visualize = true
  tasks?: PlannerTask[]
  /** Unified work list — service/shipment inferred from each item's shape. */
  jobs?: PlannerJobInput[]
  services?: ServiceInput[]
  shipments?: ShipmentInput[]
  vehicles?: PlannerVehicle[]
  /** @deprecated alias of `vehicles`. */
  members?: PlannerVehicle[]

  private _overId = ''
  private _detailVehicleId: string | null = null
  private _hiddenRoutes: Record<string, boolean> = {}
  private _colorOverride: Record<string, string> = {}
  private _keyDraft = ''
  private _showMap = true
  private _calOpen = false
  private _calMonth = ''
  private _activeTab: 'service' | 'shipment' = 'service'

  private _controller?: OptimizePlannerController
  private _mixed?: OptimizePlannerController
  private _svc?: OptimizePlannerController
  private _shp?: OptimizePlannerController
  private _wired = new WeakSet<OptimizePlannerController>()
  private _dragKey: string | null = null
  private _vehSig = ''
  private _taskSig = ''
  private _svcSig = ''
  private _shpSig = ''
  private _retime: { taskKey: string; role: StopRole; startX: number; startArrival: number; trackW: number } | null = null

  static styles = css`
    /* shadcn tokens: use the app's --primary/--card/--border/... when present,
       else fall back to a neutral zinc (black/white) default. Internal rules
       use --vm-*. */
    :host {
      display: block;
      height: 100%;
      box-sizing: border-box;
      container-type: inline-size;
      font-family: var(--dc-font, system-ui, -apple-system, 'Segoe UI', sans-serif);
      font-size: 13px;
      --vm-surface: var(--background, #ffffff);
      --vm-card: var(--card, #ffffff);
      --vm-card-fg: var(--card-foreground, #09090b);
      --vm-popover: var(--popover, #ffffff);
      --vm-fg: var(--foreground, #09090b);
      --vm-muted: var(--muted, #f4f4f5);
      --vm-muted-fg: var(--muted-foreground, #71717a);
      --vm-border: var(--border, #e4e4e7);
      --vm-input: var(--input, #e4e4e7);
      --vm-primary: var(--primary, #18181b);
      --vm-primary-fg: var(--primary-foreground, #fafafa);
      --vm-secondary: var(--secondary, #f4f4f5);
      --vm-secondary-fg: var(--secondary-foreground, #18181b);
      --vm-accent: var(--accent, #f4f4f5);
      --vm-accent-fg: var(--accent-foreground, #18181b);
      --vm-destructive: var(--destructive, #ef4444);
      --vm-destructive-fg: var(--destructive-foreground, #fafafa);
      --vm-ring: var(--ring, #a1a1aa);
      --vm-success: #16a34a;
      --vm-radius: var(--radius, 8px);
      color: var(--vm-fg);
    }
    /* Light is the default. Dark follows the OS only when the consumer opts in
       with theme="auto"; theme="dark" always forces dark. */
    @media (prefers-color-scheme: dark) {
      :host([theme='auto']) {
        --vm-surface: var(--background, #09090b);
        --vm-card: var(--card, #18181b);
        --vm-card-fg: var(--card-foreground, #fafafa);
        --vm-popover: var(--popover, #18181b);
        --vm-fg: var(--foreground, #fafafa);
        --vm-muted: var(--muted, #27272a);
        --vm-muted-fg: var(--muted-foreground, #a1a1aa);
        --vm-border: var(--border, #27272a);
        --vm-input: var(--input, #3f3f46);
        --vm-primary: var(--primary, #fafafa);
        --vm-primary-fg: var(--primary-foreground, #18181b);
        --vm-secondary: var(--secondary, #27272a);
        --vm-secondary-fg: var(--secondary-foreground, #fafafa);
        --vm-accent: var(--accent, #27272a);
        --vm-accent-fg: var(--accent-foreground, #fafafa);
        --vm-destructive-fg: var(--destructive-foreground, #fafafa);
        --vm-ring: var(--ring, #52525b);
      }
    }
    :host([theme='dark']) {
      --vm-surface: var(--background, #09090b);
      --vm-card: var(--card, #18181b);
      --vm-card-fg: var(--card-foreground, #fafafa);
      --vm-popover: var(--popover, #18181b);
      --vm-fg: var(--foreground, #fafafa);
      --vm-muted: var(--muted, #27272a);
      --vm-muted-fg: var(--muted-foreground, #a1a1aa);
      --vm-border: var(--border, #27272a);
      --vm-input: var(--input, #3f3f46);
      --vm-primary: var(--primary, #fafafa);
      --vm-primary-fg: var(--primary-foreground, #18181b);
      --vm-secondary: var(--secondary, #27272a);
      --vm-secondary-fg: var(--secondary-foreground, #fafafa);
      --vm-accent: var(--accent, #27272a);
      --vm-accent-fg: var(--accent-foreground, #fafafa);
      --vm-destructive-fg: var(--destructive-foreground, #fafafa);
      --vm-ring: var(--ring, #52525b);
    }
    * { box-sizing: border-box; }
    .wrap { display: flex; flex-direction: column; height: 100%; gap: 10px; }

    .toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .dayfield { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--vm-muted-fg); }
    /* shadcn Input */
    .input, .dayfield input { height: 36px; font: inherit; font-size: 13px; padding: 0 12px; border: 1px solid var(--vm-input); border-radius: calc(var(--vm-radius) - 2px); background: transparent; color: var(--vm-fg); box-shadow: 0 1px 2px rgba(0,0,0,.05); }
    .input:focus, .dayfield input:focus { outline: none; border-color: var(--vm-ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vm-ring) 35%, transparent); }
    /* shadcn Button */
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; height: 36px; padding: 0 16px; border: 1px solid transparent; border-radius: calc(var(--vm-radius) - 2px); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: background-color .15s ease, color .15s ease, border-color .15s ease, box-shadow .15s ease; }
    .btn:focus-visible { outline: none; border-color: var(--vm-ring); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vm-ring) 45%, transparent); }
    .btn:disabled { opacity: .5; pointer-events: none; }
    .btn-primary { background: var(--vm-primary); color: var(--vm-primary-fg); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
    .btn-primary:hover { background: color-mix(in srgb, var(--vm-primary) 90%, transparent); }
    .btn-secondary { background: var(--vm-secondary); color: var(--vm-secondary-fg); }
    .btn-secondary:hover { background: color-mix(in srgb, var(--vm-secondary) 80%, transparent); }
    .btn-outline { border-color: var(--vm-input); background: var(--vm-surface); color: var(--vm-fg); box-shadow: 0 1px 2px rgba(0,0,0,.05); }
    .btn-outline:hover { background: var(--vm-accent); color: var(--vm-accent-fg); }
    .btn-ghost { background: transparent; color: var(--vm-fg); }
    .btn-ghost:hover { background: var(--vm-accent); color: var(--vm-accent-fg); }
    .btn-sm { height: 32px; padding: 0 12px; font-size: 12px; }
    .btn-icon { width: 36px; padding: 0; }
    .btn-icon.btn-sm { width: 32px; }
    .btn.on { background: var(--vm-accent); color: var(--vm-accent-fg); border-color: var(--vm-ring); }
    /* shadcn Calendar / date picker */
    .daypick { position: relative; display: inline-flex; }
    .btn.dashed { border-style: dashed; }
    .cal { position: absolute; top: calc(100% + 6px); left: 0; z-index: 60; width: 264px; background: var(--vm-popover); color: var(--vm-fg); border: 1px solid var(--vm-border); border-radius: var(--vm-radius); box-shadow: 0 12px 34px rgba(0,0,0,.18); padding: 12px; }
    .cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .cal-title { font-size: 13px; font-weight: 600; }
    .cal-nav { width: 28px; height: 28px; opacity: .55; }
    .cal-nav:hover { opacity: 1; }
    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
    .cal-wd { margin-bottom: 4px; }
    .cal-wdl { text-align: center; font-size: 11px; color: var(--vm-muted-fg); }
    .cal-day { height: 32px; border: 1px solid transparent; background: transparent; color: var(--vm-fg); border-radius: 6px; font: inherit; font-size: 12px; cursor: pointer; }
    .cal-day:hover { background: var(--vm-accent); color: var(--vm-accent-fg); }
    .cal-day.outside { color: var(--vm-muted-fg); opacity: .5; }
    .cal-day.today { background: var(--vm-accent); color: var(--vm-accent-fg); }
    .cal-day.selected, .cal-day.selected:hover { background: var(--vm-primary); color: var(--vm-primary-fg); }
    .err { display: inline-flex; align-items: center; gap: 4px; color: var(--vm-destructive); font-size: 12px; }
    .ic { flex-shrink: 0; }
    .warn-ic { display: inline-flex; align-items: center; color: var(--vm-destructive); }
    .spinner { width: 14px; height: 14px; border: 2px solid rgba(127,127,127,.4); border-top-color: currentColor; border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* shadcn Tabs (pill) */
    .tabs { display: inline-flex; height: 36px; padding: 3px; gap: 2px; background: var(--vm-muted); border-radius: var(--vm-radius); width: fit-content; }
    .tab { display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid transparent; border-radius: calc(var(--vm-radius) - 3px); padding: 0 14px; background: transparent; color: var(--vm-fg); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: color .15s, box-shadow .15s, background .15s; }
    .tab.on { background: var(--vm-surface); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .tab .tcount { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 16px; padding: 0 5px; border-radius: 5px; background: var(--vm-secondary); color: var(--vm-secondary-fg); font-size: 10px; font-weight: 600; }
    .tab.on .tcount { background: var(--vm-primary); color: var(--vm-primary-fg); }

    .board { display: flex; gap: 12px; flex: 1 1 auto; min-height: 0; }
    /* When the map is shown the board hugs its content (no dead space below the
       vehicles) and the map takes the rest; capped so many vehicles still
       scroll instead of squeezing the map out. Map off ⇒ board fills. */
    .wrap.has-map .board { flex: 0 1 auto; max-height: 62%; }
    .pool { width: 300px; flex-shrink: 0; background: var(--vm-card); color: var(--vm-card-fg); border: 1px solid var(--vm-border); border-radius: 12px; padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
    .pool.over, .veh.over { outline: 2px solid var(--vm-ring); outline-offset: -2px; }
    .pool-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-weight: 600; position: sticky; top: -10px; background: var(--vm-card); padding: 4px 0; z-index: 1; }
    .count, .badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 18px; padding: 0 6px; border-radius: 6px; background: var(--vm-secondary); color: var(--vm-secondary-fg); font-size: 11px; font-weight: 600; }
    .empty, .track-empty { color: var(--vm-muted-fg); font-size: 12px; padding: 10px; text-align: center; }
    .track-empty { border: 1px dashed var(--vm-border); border-radius: 8px; }

    .card { display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-bottom: 6px; background: var(--vm-muted); border: 1px solid var(--vm-border); border-radius: 8px; cursor: grab; }
    .card:active { cursor: grabbing; }
    /* Visualize-only mode: nothing is draggable, so drop the grab cursors. */
    :host([visualize]) .card,
    :host([visualize]) .job-row,
    :host([visualize]) .dbar { cursor: default; }
    .card.warn { background: color-mix(in srgb, var(--vm-destructive) 12%, transparent); border-color: color-mix(in srgb, var(--vm-destructive) 35%, transparent); }
    .chip-code { font-family: ui-monospace, monospace; font-size: 11px; font-weight: 700; background: var(--vm-secondary); color: var(--vm-secondary-fg); border: 1px solid var(--vm-border); border-radius: 6px; padding: 0 6px; }
    .card .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .role-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600; border: 1px solid; border-radius: 6px; padding: 1px 7px; white-space: nowrap; }

    .vehicles { flex: 1; min-width: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .veh { background: var(--vm-card); color: var(--vm-card-fg); border: 1px solid var(--vm-border); border-radius: 12px; padding: 10px; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
    .vhead { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--vm-border); }
    .avatar { width: 34px; height: 34px; border-radius: 8px; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .avatar.sm { width: 30px; height: 30px; }
    .vmeta { flex: 1; min-width: 0; }
    .vtop { display: flex; align-items: center; gap: 6px; }
    .vplate { font-weight: 700; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
    .chip { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; border: 1px solid var(--vm-border); border-radius: 6px; padding: 1px 6px; white-space: nowrap; background: var(--vm-secondary); color: var(--vm-secondary-fg); }
    .chip-type { background: var(--vm-primary); color: var(--vm-primary-fg); border-color: var(--vm-primary); font-weight: 600; }
    .vstats { display: flex; flex-direction: column; align-items: flex-end; font-size: 11px; color: var(--vm-muted-fg); font-variant-numeric: tabular-nums; }
    /* per-row buttons reuse the shared .btn system */
    .color-swatch { width: 22px; height: 22px; padding: 0; border: 1px solid var(--vm-border); border-radius: 4px; background: none; cursor: pointer; flex-shrink: 0; }

    .jobs { border: 1px solid var(--vm-border); border-radius: 8px; overflow: hidden; }
    .job-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-top: 1px solid var(--vm-border); cursor: grab; }
    .job-row:first-child { border-top: none; }
    .job-row.warn { background: color-mix(in srgb, var(--vm-destructive) 10%, transparent); }
    .job-idx { width: 18px; height: 18px; border-radius: 50%; background: var(--vm-accent); color: var(--vm-accent-fg); font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .job-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .job-eta { font-size: 11px; color: var(--vm-success); font-variant-numeric: tabular-nums; }

    .mapwrap { position: relative; flex: 1 1 auto; min-height: 320px; border: 1px solid var(--vm-border); border-radius: 10px; overflow: hidden; }
    .mappanel { display: block; height: 100%; }
    .mapkey-banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 5; display: flex; gap: 6px; align-items: center; background: var(--vm-card); border: 1px solid var(--vm-border); border-radius: var(--vm-radius); padding: 6px 8px; box-shadow: 0 4px 14px rgba(0,0,0,.12); max-width: calc(100% - 24px); }
    .mapkey-banner input { flex: 1; min-width: 180px; height: 32px; font: inherit; font-size: 12px; padding: 0 10px; border: 1px solid var(--vm-input); border-radius: calc(var(--vm-radius) - 2px); background: var(--vm-surface); color: var(--vm-fg); }
    .mapkey-banner button { border: none; border-radius: calc(var(--vm-radius) - 2px); height: 32px; padding: 0 12px; font: inherit; font-size: 12px; font-weight: 500; background: var(--vm-primary); color: var(--vm-primary-fg); cursor: pointer; }

    .bar-label { font-size: 11px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-eta { font-size: 10px; opacity: .9; font-variant-numeric: tabular-nums; }
    .axis { position: absolute; inset: 0; }
    .tick { position: absolute; top: 0; bottom: 0; border-left: 1px dashed var(--vm-border); font-size: 9px; color: var(--vm-muted-fg); padding: 2px; }

    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.8); display: flex; align-items: center; justify-content: center; z-index: 2147483000; padding: 16px; }
    .modal { background: var(--vm-popover); color: var(--vm-fg); border: 1px solid var(--vm-border); border-radius: calc(var(--vm-radius) + 4px); width: min(860px, 100%); max-height: 88vh; overflow: auto; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
    .modal-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--vm-border); position: sticky; top: 0; background: var(--vm-popover); }
    .modal-title { font-weight: 600; }
    .modal-sub { font-size: 11px; color: var(--vm-muted-fg); }
    .modal-close { display: inline-flex; align-items: center; margin-left: auto; border: none; background: transparent; cursor: pointer; color: var(--vm-muted-fg); }
    .modal-body { padding: 16px; }
    .hint { font-size: 12px; color: var(--vm-muted-fg); margin-bottom: 8px; }
    .dtrack { position: relative; height: 100px; border: 1px solid var(--vm-border); border-radius: 8px; background: var(--vm-muted); overflow: hidden; margin-bottom: 14px; }
    .dbar { position: absolute; height: 36px; min-width: 84px; max-width: 30%; display: flex; flex-direction: column; justify-content: center; padding: 3px 8px; border-radius: 6px; color: #fff; cursor: ew-resize; touch-action: none; user-select: none; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,.2); z-index: 2; }
    /* Connector linking a shipment's pickup and delivery bars on one lane. */
    .dlink { position: absolute; height: 4px; border-radius: 2px; opacity: .5; z-index: 1; }

    /* Narrow embeds (sidebar / tablet): stack the pool above the vehicle list. */
    @container (max-width: 720px) {
      .board { flex-direction: column; }
      .pool { width: auto; flex-shrink: 1; max-height: 38vh; }
    }
    /* Phones: tighter spacing, let the optimize button take a full row, and keep
       the map tall enough to be useful under the stacked board. */
    @container (max-width: 460px) {
      :host { font-size: 12px; }
      .toolbar { gap: 8px; }
      .daypick, .btn-primary { flex: 1 1 auto; }
      .btn-primary { justify-content: center; }
      .btn { padding: 0 12px; }
      .pool { max-height: 32vh; }
      .mapwrap { min-height: 240px; }
      .modal-body { padding: 12px; }
    }
  `

  connectedCallback() {
    super.connectedCallback()
    this._ensureControllers()
    document.addEventListener('pointerdown', this._onDocPointerDown, true)
    document.addEventListener('keydown', this._onDocKeyDown)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener('pointerdown', this._onDocPointerDown, true)
    document.removeEventListener('keydown', this._onDocKeyDown)
    window.removeEventListener('pointermove', this._onRetimeMove)
    window.removeEventListener('pointerup', this._onRetimeUp)
  }

  private _onDocPointerDown = (e: Event) => {
    if (!this._calOpen) return
    const pick = this.shadowRoot?.querySelector('.daypick')
    if (pick && !e.composedPath().includes(pick)) this._calOpen = false
  }
  private _onDocKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this._calOpen) this._calOpen = false
  }

  willUpdate(changed: PropertyValues) {
    const c = this._ensureControllers()
    if (changed.has('apiKey')) for (const x of this._allControllers()) x.setApiKey(this.apiKey)
    if (changed.has('baseUrl')) for (const x of this._allControllers()) x.setBaseUrl(this.baseUrl)
    if (changed.has('day') && this.day && this.day !== c.state.day) this._applyDay(this.day)
    if (
      changed.has('tasks') || changed.has('jobs') || changed.has('services') || changed.has('shipments') ||
      changed.has('vehicles') || changed.has('members') || changed.has('allowMixed')
    ) {
      this._syncInputs()
    }
  }

  /** In mixed mode one controller holds all tasks; in split mode one per type,
   *  with `_controller` pointing at the active tab's. No controller drift. */
  private _ensureControllers(): OptimizePlannerController {
    let created = false
    if (this.allowMixed) {
      if (!this._mixed) { this._mixed = this._make(); created = true }
      this._controller = this._mixed
    } else {
      if (!this._svc) { this._svc = this._make(); created = true }
      if (!this._shp) { this._shp = this._make(); created = true }
      this._controller = this._activeTab === 'shipment' ? this._shp : this._svc
    }
    if (created) this._syncInputs(true)
    return this._controller!
  }

  private _make(): OptimizePlannerController {
    const c = new OptimizePlannerController({ apiKey: this.apiKey, baseUrl: this.baseUrl, day: this.day || undefined })
    this._wire(c)
    return c
  }

  private _wire(c: OptimizePlannerController) {
    if (this._wired.has(c)) return
    this._wired.add(c)
    c.subscribe(() => this.requestUpdate())
    c.on('optimize', (d) => this._dispatch('vm-optimize', { day: c.state.day, response: d.response }))
    c.on('assignmentchange', (d) => this._dispatch('vm-assignmentchange', { day: c.state.day, ...d }))
    c.on('retime', (d) => this._dispatch('vm-retime', { day: c.state.day, taskId: d.taskKey, role: d.role, arrival: d.arrival }))
    c.on('confirm', (d) => this._dispatch('vm-confirm', d))
  }

  private _allControllers(): OptimizePlannerController[] {
    return this.allowMixed
      ? this._mixed ? [this._mixed] : []
      : [this._svc, this._shp].filter((x): x is OptimizePlannerController => !!x)
  }

  private _dispatch(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }))
  }

  /** The element owns the day; emit ONE daychange and push it to every controller. */
  private _applyDay(iso: string) {
    this.day = iso
    for (const c of this._allControllers()) c.setDay(iso)
    this._dispatch('vm-daychange', { day: iso })
  }

  private _mergedTasks(): PlannerTask[] {
    const out: PlannerTask[] = []
    if (this.tasks?.length) out.push(...this.tasks)
    if (this.jobs?.length) out.push(...classifyJobs(this.jobs))
    if (this.services?.length) for (const s of this.services) out.push({ ...s, kind: 'service' })
    if (this.shipments?.length) for (const sh of this.shipments) out.push({ ...sh, kind: 'shipment' })
    return out
  }

  private _syncInputs(force = false) {
    const vehicles = this.vehicles?.length ? this.vehicles : (this.members ?? [])
    const vSig = JSON.stringify(vehicles.map((v) => v.id))
    const vehChanged = force || vSig !== this._vehSig
    if (vehChanged) this._vehSig = vSig
    const all = this._mergedTasks()

    if (this.allowMixed) {
      const c = this._mixed
      if (!c) return
      if (vehChanged) c.setVehicles(vehicles)
      const tSig = JSON.stringify(all.map((t) => [t.id, t.kind]))
      if (force || tSig !== this._taskSig) { this._taskSig = tSig; c.setTasks(all) }
    } else {
      if (vehChanged) { this._svc?.setVehicles(vehicles); this._shp?.setVehicles(vehicles) }
      const services = all.filter((t) => t.kind === 'service')
      const shipments = all.filter((t) => t.kind === 'shipment')
      const sSig = JSON.stringify(services.map((t) => t.id))
      if (force || sSig !== this._svcSig) { this._svcSig = sSig; this._svc?.setTasks(services) }
      const hSig = JSON.stringify(shipments.map((t) => t.id))
      if (force || hSig !== this._shpSig) { this._shpSig = hSig; this._shp?.setTasks(shipments) }
    }
  }

  private _setTab(tab: 'service' | 'shipment') {
    if (this._activeTab === tab) return
    this._activeTab = tab
    if (!this.allowMixed) this._controller = tab === 'shipment' ? this._shp : this._svc
  }

  /** Stops for a vehicle, filtered to the active tab's task kind. */
  private _activeStops(vk: string): RouteStop[] {
    const stops = this._controller?.stopsForVehicle(vk) ?? []
    return stops.filter((st) => this._task(st.taskKey)?.kind === this._activeTab)
  }

  // ─── small view helpers ──────────────────────────────────────────────────

  private _task(key: string): PlannerTask | undefined {
    return this._controller?.taskByKey(key)
  }
  private _taskName(key: string): string {
    return this._task(key)?.name || `#${key}`
  }
  private _taskCode(key: string): string {
    return this._task(key)?.code || `#${key}`
  }
  private _vehColor(v: PlannerVehicle, i: number): string {
    return this._colorOverride[String(v.id)] || v.color || ROUTE_COLORS[i % ROUTE_COLORS.length]
  }
  private _capacityLabel(v: PlannerVehicle): string {
    return v.capacity && v.capacity.length ? v.capacity.join('/') : ''
  }

  // ─── drag & drop ─────────────────────────────────────────────────────────

  private _onDragStart(e: DragEvent, key: string) {
    if (this.visualize) return
    this._dragKey = key
    e.dataTransfer?.setData('text/plain', key)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }
  private _onDragOver(e: DragEvent, overId: string) {
    if (this.visualize) return // no preventDefault ⇒ not a drop target
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    if (this._overId !== overId) this._overId = overId
  }
  private _onDragLeave() {
    this._overId = ''
  }
  private _resolveDrag(e: DragEvent): string {
    return this._dragKey ?? e.dataTransfer?.getData('text/plain') ?? ''
  }
  private _drop(e: DragEvent, vehicleKey: string | null) {
    if (this.visualize) return
    e.preventDefault()
    this._controller?.move(this._resolveDrag(e), vehicleKey)
    this._overId = ''
    this._dragKey = null
  }

  // ─── retime (drag a bar in the detail dialog) ──────────────────────────────

  private _onRetimeDown(e: PointerEvent, taskKey: string, role: StopRole) {
    if (this.visualize) return
    e.preventDefault()
    const bar = e.currentTarget as HTMLElement
    const track = bar.parentElement as HTMLElement | null
    const trackW = track?.clientWidth || 1
    const cur = this._controller?.state.arrivals[stopKey(taskKey, role)]
    const startArrival = cur != null ? secOfDay(cur) : 8 * 3600
    this._retime = { taskKey, role, startX: e.clientX, startArrival, trackW }
    window.addEventListener('pointermove', this._onRetimeMove)
    window.addEventListener('pointerup', this._onRetimeUp)
  }
  private _onRetimeMove = (e: PointerEvent) => {
    if (!this._retime || !this._controller) return
    const dx = e.clientX - this._retime.startX
    const dSec = (dx / this._retime.trackW) * 86400
    const na = Math.max(0, Math.min(86399, Math.round(this._retime.startArrival + dSec)))
    this._controller.retime(this._retime.taskKey, this._retime.role, na)
  }
  private _onRetimeUp = () => {
    window.removeEventListener('pointermove', this._onRetimeMove)
    window.removeEventListener('pointerup', this._onRetimeUp)
    this._retime = null
  }

  // ─── actions ───────────────────────────────────────────────────────────────

  private _toggleCal() {
    this._calOpen = !this._calOpen
    if (this._calOpen) this._calMonth = this._controller?.state.day || toISO(new Date())
  }
  private _calShift(delta: number) {
    const base = parseISO(this._calMonth || toISO(new Date()))
    this._calMonth = toISO(new Date(base.getFullYear(), base.getMonth() + delta, 1))
  }
  private _pickDay(iso: string) {
    this._calOpen = false
    this._applyDay(iso)
  }
  private async _optimize() {
    try {
      // Only optimize the active tab's task type; the other type is untouched.
      await this._controller?.optimize({ kinds: [this._activeTab] })
    } catch {
      /* error is surfaced through controller state */
    }
  }
  private _applyMapKey() {
    const k = this._keyDraft.trim()
    if (k) this.tileKey = k
  }

  // ─── map ─────────────────────────────────────────────────────────────────

  private _mapRoutes(): MapRoute[] {
    const c = this._controller
    if (!c) return []
    const s = c.state
    const routes: MapRoute[] = []
    s.vehicles.forEach((v, i) => {
      const vk = String(v.id)
      if (this._hiddenRoutes[vk]) return
      const stops: MapStop[] = this
        ._activeStops(vk)
        .map((st, idx): MapStop | null =>
          st.location
            ? {
                lng: st.location[0],
                lat: st.location[1],
                label: this._taskName(st.taskKey),
                index: idx + 1,
                role: st.role,
                eta: st.arrival != null ? formatArrival(st.arrival) : undefined,
              }
            : null,
        )
        .filter((x): x is MapStop => x !== null)
      if (stops.length) routes.push({ id: vk, name: v.plate || v.name || vk, color: this._vehColor(v, i), stops, profile: v.profile ?? 'car', origin: v.start })
    })
    // Only jobs ASSIGNED to a vehicle are drawn (the per-vehicle routes above).
    // Pending jobs sitting in the pool are intentionally NOT plotted — a job
    // appears on the map only once it's dragged onto / optimized to a vehicle.
    return routes
  }

  // ─── render ────────────────────────────────────────────────────────────────

  render() {
    const c = this._ensureControllers()
    const s = c.state
    const all = this._mergedTasks()
    const svcTotal = all.reduce((n, t) => (t.kind === 'service' ? n + 1 : n), 0)
    const shpTotal = all.length - svcTotal
    const active = this._activeTab
    const poolKeys = s.unassigned.filter((k) => this._task(k)?.kind === active)
    const vehicles = s.vehicles
    return html`
      <div class="wrap ${this._showMap ? 'has-map' : ''}">
        <div class="toolbar">
          ${this.renderDayPicker(s.day)}
          <button class="btn btn-primary" ?disabled=${s.loading} @click=${() => this._optimize()}>
            ${s.loading ? html`<span class="spinner"></span> Đang tối ưu…` : html`${icon('sparkles', 16)} Tối ưu ${active === 'service' ? 'dịch vụ' : 'giao hàng'}`}
          </button>
          <button class="btn btn-outline btn-sm ${this._showMap ? 'on' : ''}" @click=${() => { this._showMap = !this._showMap }}>${icon('map', 15)} Bản đồ</button>
          ${this.visualize ? nothing : html`<button class="btn btn-secondary" @click=${() => c.confirm()}>${icon('check', 16)} Xác nhận</button>`}
          ${s.error ? html`<span class="err">${icon('alert', 13)} ${s.error}</span>` : nothing}
        </div>

        <div class="tabs" role="tablist">
          <button class="tab ${active === 'service' ? 'on' : ''}" @click=${() => this._setTab('service')}>${icon('wrench', 14)} Dịch vụ <span class="tcount">${svcTotal}</span></button>
          <button class="tab ${active === 'shipment' ? 'on' : ''}" @click=${() => this._setTab('shipment')}>${icon('package', 14)} Giao hàng <span class="tcount">${shpTotal}</span></button>
        </div>

        <div class="board">
          <div
            class="pool ${this._overId === 'pool' ? 'over' : ''}"
            @dragover=${(e: DragEvent) => this._onDragOver(e, 'pool')}
            @dragleave=${() => this._onDragLeave()}
            @drop=${(e: DragEvent) => this._drop(e, null)}
          >
            <div class="pool-head">${active === 'service' ? 'Dịch vụ' : 'Giao hàng (Lấy→Giao)'} chờ <span class="count">${poolKeys.length}</span></div>
            ${poolKeys.map((key) => this.renderCard(key, active))}
            ${poolKeys.length === 0 ? html`<div class="empty">${active === 'service' ? 'Không có dịch vụ chờ' : 'Không có đơn giao chờ'}</div>` : nothing}
          </div>

          <div class="vehicles">
            ${vehicles.map((v, i) => this.renderVehicle(v, i))}
            ${vehicles.length === 0 ? html`<div class="empty">Chưa có xe — set .vehicles</div>` : nothing}
          </div>
        </div>

        ${this._showMap
          ? html`<div class="mapwrap">
              <vietmap-route-map class="mappanel" tile-key=${this.tileKey} .routes=${this._mapRoutes()}></vietmap-route-map>
              ${this.tileKey
                ? nothing
                : html`<div class="mapkey-banner">
                    <input
                      placeholder="Nhập VietMap API key để xem nền bản đồ"
                      .value=${this._keyDraft}
                      @input=${(e: Event) => { this._keyDraft = (e.target as HTMLInputElement).value }}
                      @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this._applyMapKey() }}
                    />
                    <button @click=${() => this._applyMapKey()}>Áp dụng</button>
                  </div>`}
            </div>`
          : nothing}
      </div>
      ${this.renderDetailDialog()}
    `
  }

  private renderDayPicker(day: string) {
    return html`
      <div class="daypick">
        <button class="btn btn-outline dashed" @click=${() => this._toggleCal()}>
          ${icon('calendar', 15)} ${day ? fmtDMY(day) : 'Chọn ngày'}
        </button>
        ${this._calOpen ? this.renderCalendar(day) : nothing}
      </div>
    `
  }

  private renderCalendar(day: string) {
    const base = parseISO(this._calMonth || day || toISO(new Date()))
    const y = base.getFullYear()
    const m = base.getMonth()
    const today = new Date()
    const sel = day ? parseISO(day) : null
    return html`
      <div class="cal" @click=${(e: Event) => e.stopPropagation()}>
        <div class="cal-head">
          <button class="btn btn-outline btn-icon btn-sm cal-nav" @click=${() => this._calShift(-1)}>${icon('chevronLeft', 16)}</button>
          <span class="cal-title">Tháng ${m + 1}/${y}</span>
          <button class="btn btn-outline btn-icon btn-sm cal-nav" @click=${() => this._calShift(1)}>${icon('chevronRight', 16)}</button>
        </div>
        <div class="cal-grid cal-wd">
          ${WEEKDAYS.map((w) => html`<span class="cal-wdl">${w}</span>`)}
        </div>
        <div class="cal-grid">
          ${monthMatrix(y, m).map((d) => {
            const outside = d.getMonth() !== m
            const isSel = sel != null && sameDay(d, sel)
            const isToday = sameDay(d, today)
            const cls = `cal-day${outside ? ' outside' : ''}${isSel ? ' selected' : ''}${!isSel && isToday ? ' today' : ''}`
            return html`<button class=${cls} @click=${() => this._pickDay(toISO(d))}>${d.getDate()}</button>`
          })}
        </div>
      </div>
    `
  }

  private renderCard(key: string, kind: 'service' | 'shipment') {
    const reason = this._controller?.state.reasons[key]
    const badgeColor = kind === 'shipment' ? ROLE_COLOR.pickup : ROLE_COLOR.service
    const badgeLabel = kind === 'shipment' ? 'Lấy→Giao' : 'Dịch vụ'
    const badgeIcon: keyof typeof ICON = kind === 'shipment' ? 'package' : 'wrench'
    return html`
      <div
        class="card ${reason ? 'warn' : ''}"
        draggable=${this.visualize ? 'false' : 'true'}
        title=${reason ?? ''}
        @dragstart=${(e: DragEvent) => this._onDragStart(e, key)}
      >
        <span class="chip-code">${this._taskCode(key)}</span>
        <span class="name">${this._taskName(key)}</span>
        <span class="role-badge" style="color:${badgeColor};border-color:${badgeColor}">${icon(badgeIcon, 12)} ${badgeLabel}</span>
        ${reason ? html`<span class="warn-ic" title=${reason}>${icon('alert', 13)}</span>` : nothing}
      </div>
    `
  }

  private renderVehicle(v: PlannerVehicle, i: number) {
    const c = this._controller!
    const vk = String(v.id)
    const color = this._vehColor(v, i)
    const stops = this._activeStops(vk)
    const count = (c.state.assignment[vk] ?? []).filter((k) => this._task(k)?.kind === this._activeTab).length
    const stat = c.state.stats[vk]
    const cap = this._capacityLabel(v)
    const skills = v.skills ?? []
    const cities = v.cities ?? []
    const overId = `veh:${vk}`
    return html`
      <div
        class="veh ${this._overId === overId ? 'over' : ''}"
        @dragover=${(e: DragEvent) => this._onDragOver(e, overId)}
        @dragleave=${() => this._onDragLeave()}
        @drop=${(e: DragEvent) => this._drop(e, vk)}
      >
        <div class="vhead">
          <span class="avatar" style="background:${color}">${initials(v.avatarText || v.plate || v.name)}</span>
          <div class="vmeta">
            <div class="vtop">
              <span class="vplate">${v.plate || v.name || `Xe #${v.id}`}</span>
              ${v.vehicleType ? html`<span class="chip chip-type">${icon('truck', 12)} ${v.vehicleType}</span>` : nothing}
              <span class="count">${count}</span>
            </div>
            <div class="chips">
              ${cap ? html`<span class="chip">${icon('package', 12)} ${cap}</span>` : nothing}
              ${v.workingHours ? html`<span class="chip">${icon('clock', 12)} ${hhmm(v.workingHours[0])}–${hhmm(v.workingHours[1])}</span>` : nothing}
              ${v.plate && v.name ? html`<span class="chip">${icon('user', 12)} ${v.name}</span>` : nothing}
              ${skills.slice(0, 2).map((sk) => html`<span class="chip">${sk}</span>`)}
              ${skills.length > 2 ? html`<span class="chip">+${skills.length - 2}</span>` : nothing}
              ${cities.slice(0, 2).map((ct) => html`<span class="chip">${icon('mapPin', 12)} ${ct}</span>`)}
            </div>
          </div>
          ${stat ? html`<div class="vstats"><span>${formatDistance(stat.distance ?? 0)}</span><span>${formatDuration(stat.duration)}</span></div>` : nothing}
          ${this.visualize
            ? nothing
            : html`<input
                class="color-swatch"
                type="color"
                .value=${color}
                title="Màu tuyến"
                @input=${(e: Event) => { this._colorOverride = { ...this._colorOverride, [vk]: (e.target as HTMLInputElement).value } }}
              />`}
          <button
            class="btn btn-outline btn-icon btn-sm"
            title="Ẩn/hiện tuyến trên bản đồ"
            style=${this._hiddenRoutes[vk] ? 'opacity:.45' : ''}
            @click=${() => { this._hiddenRoutes = { ...this._hiddenRoutes, [vk]: !this._hiddenRoutes[vk] } }}
          >${icon('map', 14)}</button>
          <button class="btn btn-outline btn-sm" @click=${() => { this._detailVehicleId = vk }}>Chi tiết</button>
        </div>
        ${stops.length === 0
          ? html`<div class="track-empty">${this.visualize ? 'Chưa có điểm' : 'Kéo thả công việc vào đây'}</div>`
          : html`<div class="jobs">${stops.map((st, idx) => this.renderStopRow(st, idx))}</div>`}
      </div>
    `
  }

  private renderStopRow(stop: RouteStop, idx: number) {
    const reason = this._controller?.state.reasons[stop.taskKey]
    return html`
      <div
        class="job-row ${reason ? 'warn' : ''}"
        draggable=${this.visualize ? 'false' : 'true'}
        title=${reason ?? ''}
        @dragstart=${(e: DragEvent) => this._onDragStart(e, stop.taskKey)}
      >
        <span class="job-idx">${idx + 1}</span>
        <span class="role-badge" style="color:${ROLE_COLOR[stop.role]};border-color:${ROLE_COLOR[stop.role]}">${icon(ROLE_ICON[stop.role], 12)} ${ROLE_LABEL[stop.role]}</span>
        <span class="chip-code">${this._taskCode(stop.taskKey)}</span>
        <span class="job-name">${this._taskName(stop.taskKey)}</span>
        ${reason ? html`<span class="warn-ic" title=${reason}>${icon('alert', 13)}</span>` : nothing}
        ${stop.arrival != null ? html`<span class="job-eta">${formatArrival(stop.arrival)}</span>` : nothing}
      </div>
    `
  }

  private renderDetailDialog() {
    const vk = this._detailVehicleId
    if (!vk || !this._controller) return nothing
    const c = this._controller
    const vehicles = c.state.vehicles
    const i = vehicles.findIndex((x) => String(x.id) === vk)
    const v = vehicles[i]
    if (!v) return nothing
    const color = this._vehColor(v, i)
    const stops = this._activeStops(vk)
    const stat = c.state.stats[vk]
    // One lane per task: a shipment's pickup+delivery share a row (linked by a
    // connector); a service is a single-bar lane.
    const lanes: { taskKey: string; stops: RouteStop[] }[] = []
    const laneOf = new Map<string, number>()
    for (const st of stops) {
      let li = laneOf.get(st.taskKey)
      if (li == null) { li = lanes.length; laneOf.set(st.taskKey, li); lanes.push({ taskKey: st.taskKey, stops: [] }) }
      lanes[li].stops.push(st)
    }
    const AXIS_TOP = 22
    const LANE_H = 46
    const trackH = Math.max(96, AXIS_TOP + lanes.length * LANE_H + 8)
    return html`
      <div class="modal-backdrop" @click=${() => { this._detailVehicleId = null }}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-head">
            <span class="avatar sm" style="background:${color}">${initials(v.avatarText || v.plate || v.name)}</span>
            <div>
              <div class="modal-title">${v.plate || v.name || `Xe #${v.id}`}</div>
              <div class="modal-sub">${c.state.day} · ${stops.length} điểm${stat ? ` · ${formatDistance(stat.distance ?? 0)} · ${formatDuration(stat.duration)}` : ''}</div>
            </div>
            <button class="modal-close" @click=${() => { this._detailVehicleId = null }}>${icon('x', 18)}</button>
          </div>
          <div class="modal-body">
            <div class="hint">${this.visualize ? 'Dòng thời gian đến (ETA) theo tuyến' : 'Kéo ngang thanh để chỉnh giờ đến (ETA)'}</div>
            <div class="dtrack" style="height:${trackH}px">
              <div class="axis">
                ${[0, 3, 6, 9, 12, 15, 18, 21].map((h) => html`<span class="tick" style="left:${(h / 24) * 100}%">${h}:00</span>`)}
              </div>
              ${lanes.length === 0
                ? html`<div class="track-empty">Chưa có điểm — kéo thả từ danh sách chờ</div>`
                : lanes.map((lane, li) => this.renderLane(lane, AXIS_TOP + li * LANE_H, color))}
            </div>
            ${stops.length > 0
              ? html`<div class="jobs">${stops.map((st, idx) => this.renderStopRow(st, idx))}</div>`
              : nothing}
          </div>
        </div>
      </div>
    `
  }

  /** A timeline lane = one task. A shipment gets a connector between its two
   *  bars so pickup and delivery read as one linked job. */
  private renderLane(lane: { taskKey: string; stops: RouteStop[] }, topPx: number, vehicleColor: string) {
    const barTop = topPx + 5
    const lefts = lane.stops.map((st) => Math.max(0, Math.min(92, (barSec(st) / 86400) * 100)))
    const link =
      lane.stops.length >= 2
        ? (() => {
            const a = Math.min(...lefts)
            const b = Math.max(...lefts)
            return html`<div class="dlink" style="top:${barTop + 16}px; left:${a}%; width:${Math.max(0, b - a)}%; background:${ROLE_COLOR.pickup};"></div>`
          })()
        : nothing
    return html`${link}${lane.stops.map((st) => this.renderDialogBar(st, barTop, vehicleColor))}`
  }

  private renderDialogBar(stop: RouteStop, topPx: number, vehicleColor: string) {
    const sec = barSec(stop)
    const leftPct = Math.max(0, Math.min(92, (sec / 86400) * 100))
    const color = stop.role === 'service' ? vehicleColor : ROLE_COLOR[stop.role]
    return html`
      <div
        class="dbar"
        style="top:${topPx}px; left:${leftPct}%; background:${color};"
        title=${this._taskName(stop.taskKey)}
        @pointerdown=${(e: PointerEvent) => this._onRetimeDown(e, stop.taskKey, stop.role)}
      >
        <span class="bar-label">${ROLE_LABEL[stop.role]} · ${this._taskName(stop.taskKey)}</span>
        <span class="bar-eta">${formatArrival(sec)}</span>
      </div>
    `
  }
}

if (!customElements.get('vietmap-optimize-planner')) {
  customElements.define('vietmap-optimize-planner', VietmapOptimizePlanner)
}
