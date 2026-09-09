import { LitElement, html, css } from 'lit'
import type { PropertyValues } from 'lit'

export type MapStopRole = 'service' | 'pickup' | 'delivery'

export interface MapStop {
  lng: number
  lat: number
  label: string
  /** 1-based stop order; 0 = an unassigned pin (no number). */
  index: number
  /** Distinguishes pickup / delivery / service in the click popup. */
  role?: MapStopRole
  /** Pre-formatted ETA shown in the popup. */
  eta?: string
}

export interface MapRoute {
  id: string
  name: string
  color: string
  stops: MapStop[]
  /** Routing profile for real road geometry. @default 'car' */
  profile?: 'car' | 'motorcycle' | 'truck'
  /** Vehicle depot/start `[lng, lat]` — the route line begins here so the real
   *  road path from the depot through the stops is shown. */
  origin?: [number, number]
}

// VietMap GL JS — a MapLibre fork that can parse VietMap's OWN vector tiles.
// Plain maplibre-gl throws "Unable to parse the tile" on maps.vietmap.vn vector
// (.pbf) tiles, so we use VietMap's build (same one driver-connect-web-react
// ships). It's API-compatible with MapLibre (Map/Marker/Popup/LngLatBounds/…)
// and is loaded on demand from a CDN so it isn't bundled into the SDK.
const ML_JS = 'https://cdn.jsdelivr.net/npm/@vietmap/vietmap-gl-js@6.0.1/dist/vietmap-gl.js'
const ML_CSS = 'https://cdn.jsdelivr.net/npm/@vietmap/vietmap-gl-js@6.0.1/dist/vietmap-gl.css'

const ROLE_LABEL: Record<MapStopRole, string> = { service: 'Dịch vụ', pickup: 'Lấy hàng', delivery: 'Giao hàng' }
const ROLE_COLOR: Record<MapStopRole, string> = { service: '#0891b2', pickup: '#7c3aed', delivery: '#db2777' }

/* eslint-disable @typescript-eslint/no-explicit-any */
// VietMap GL exposes the global `vietmapgl`; fall back to `maplibregl` in case a
// host page already loaded upstream MapLibre under that name.
type GlobalGL = { vietmapgl?: any; maplibregl?: any }
function getGL(): any {
  const w = window as unknown as GlobalGL
  return w.vietmapgl ?? w.maplibregl
}
let mlPromise: Promise<any> | null = null
function loadMapGL(): Promise<any> {
  const existing = getGL()
  if (existing) return Promise.resolve(existing)
  if (mlPromise) return mlPromise
  mlPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = ML_JS
    s.onload = () => resolve(getGL())
    s.onerror = () => reject(new Error('Failed to load VietMap GL'))
    document.head.appendChild(s)
  })
  return mlPromise
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'))
}

/**
 * Fetch real road geometry through a set of stops (in order) from the VietMap
 * routing API. Returns `[lng, lat][]` or null on any failure (caller falls back
 * to straight lines). Uses `points_encoded=false` so no polyline decode needed.
 */
async function fetchRoadGeometry(
  key: string,
  profile: string,
  points: [number, number][],
): Promise<[number, number][] | null> {
  if (!key || points.length < 2) return null
  const pts = points.map((c) => `&point=${c[1]},${c[0]}`).join('')
  const url = `https://maps.vietmap.vn/api/route/v4?apikey=${key}&points_encoded=false&vehicle=${profile}&optimize=false${pts}`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data: any = await res.json()
    const coords = data?.paths?.[0]?.points?.coordinates
    return Array.isArray(coords) && coords.length ? (coords as [number, number][]) : null
  } catch {
    return null
  }
}

/**
 * `<vietmap-route-map>` — visualizes assigned work on a VietMap (MapLibre) map,
 * modeled on driver-connect's auto-assign map: one color per vehicle, numbered
 * markers in stop order, a real road-geometry route line (casing + core) with a
 * straight-line fallback, click popups, and fit-to-bounds. Pass `.routes` and a
 * `tile-key`. Without a key it falls back to a gray canvas so markers still show.
 */
export class VietmapRouteMap extends LitElement {
  static properties = {
    tileKey: { type: String, attribute: 'tile-key' },
    routes: { attribute: false },
  }

  tileKey = ''
  routes: MapRoute[] = []

  private _map?: any
  private _loaded = false
  private _markers: any[] = []
  private _layerIds: string[] = []
  private _sourceIds: string[] = []
  private _geomCache = new Map<string, [number, number][]>()
  private _ro?: ResizeObserver
  private _roRaf = 0
  private _lastSig = ''

  static styles = css`
    :host { display: block; height: 100%; }
    .map { width: 100%; height: 100%; }
    .err { padding: 8px; color: #b91c1c; font: 12px system-ui; }
    .vm-pin { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: #fff; font: 700 12px system-ui; box-shadow: 0 1px 4px rgba(0,0,0,.4); cursor: pointer; }
    .vm-depot { width: 15px; height: 15px; border-radius: 4px; border: 2.5px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.45); }
    .vm-pop { font: 13px system-ui; min-width: 150px; }
    .vm-pop b { display: block; margin-bottom: 4px; }
    .vm-pop .rb { display: inline-block; font-size: 10px; font-weight: 600; border-radius: 6px; padding: 1px 6px; color: #fff; }
    .vm-pop .eta { color: #16a34a; font-variant-numeric: tabular-nums; }
  `

  firstUpdated() {
    void this._init()
  }

  updated(changed: PropertyValues) {
    // Redraw only when the route data actually changed by value. The planner
    // hands us a fresh `routes` array on every re-render (e.g. drop-zone
    // highlight while dragging a job), but the assignment doesn't change until
    // the drop — without this guard the map would clear + re-add every marker
    // and re-run fitBounds on each drag move, which is janky.
    if (changed.has('routes') && this._loaded && this._routesSig() !== this._lastSig) this._draw()
  }

  /** Value fingerprint of `routes` — everything `_draw()` renders. */
  private _routesSig(): string {
    return (this.routes ?? [])
      .map(
        (r) =>
          `${r.id}:${r.color}:${r.profile ?? ''}:${(r.origin ?? []).join(',')}:` +
          r.stops.map((s) => `${s.lng},${s.lat},${s.index},${s.role ?? ''},${s.eta ?? ''},${s.label}`).join('|'),
      )
      .join(';')
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    cancelAnimationFrame(this._roRaf)
    try { this._ro?.disconnect() } catch { /* ignore */ }
    this._ro = undefined
    try { this._map?.remove() } catch { /* ignore */ }
    this._map = undefined
    this._loaded = false
  }

  private styleFor(dark: boolean): any {
    return this.tileKey
      ? `https://maps.vietmap.vn/maps/styles/${dark ? 'dm' : 'lm'}/style.json?apikey=${this.tileKey}`
      : {
          version: 8,
          sources: {},
          layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef2f6' } }],
        }
  }

  private async _init() {
    let gl: any
    try {
      gl = await loadMapGL()
    } catch {
      const el = this.shadowRoot?.querySelector('.map')
      if (el) el.innerHTML = '<div class="err">Không tải được bản đồ.</div>'
      return
    }
    if (!this.shadowRoot!.querySelector('link[data-ml]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = ML_CSS
      link.setAttribute('data-ml', '')
      this.shadowRoot!.appendChild(link)
    }
    const container = this.shadowRoot!.querySelector('.map') as HTMLElement
    // Light basemap to match the planner's light-default theme.
    const dark = false
    this._map = new gl.Map({
      container,
      style: this.styleFor(dark),
      center: [106.66, 10.76],
      zoom: 11,
      renderWorldCopies: false,
      attributionControl: { compact: true },
    })
    // The container often isn't at its final size when the map is constructed
    // (mount, font load, flex/container-query reflow, or the planner's "Bản đồ"
    // toggle). MapLibre reads the container size once at init, so without this
    // the canvas stays stuck at that first size and the map looks blank or cut
    // off. Observe the container from the start and resize the canvas to match.
    this._observeSize(container)
    this._map.on('load', () => {
      this._loaded = true
      this._map.resize()
      this._draw()
    })
  }

  /** Keep the MapLibre canvas matched to the container as it resizes. */
  private _observeSize(container: HTMLElement) {
    if (this._ro || typeof ResizeObserver === 'undefined') return
    this._ro = new ResizeObserver(() => {
      // Coalesce to a frame so we never resize mid-layout (avoids the
      // "ResizeObserver loop" warning and redundant work).
      cancelAnimationFrame(this._roRaf)
      this._roRaf = requestAnimationFrame(() => {
        try { this._map?.resize() } catch { /* ignore */ }
      })
    })
    this._ro.observe(container)
  }

  private _clear() {
    this._markers.forEach((m) => m.remove())
    this._markers = []
    for (const id of this._layerIds) if (this._map.getLayer(id)) this._map.removeLayer(id)
    for (const id of this._sourceIds) if (this._map.getSource(id)) this._map.removeSource(id)
    this._layerIds = []
    this._sourceIds = []
  }

  private _lineFeature(coords: [number, number][]) {
    return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }
  }

  private _draw() {
    if (!this._map || !this._loaded) return
    this._lastSig = this._routesSig()
    const gl = getGL()
    this._clear()
    const bounds = new gl.LngLatBounds()

    for (const r of this.routes ?? []) {
      const isInternal = r.id.startsWith('__')
      const stopPts = r.stops.map((s) => [s.lng, s.lat] as [number, number])
      // The line (and the road-geometry request) starts at the vehicle depot so
      // the actual travel path from the depot through the stops is drawn — even
      // for a single-stop vehicle.
      const linePts: [number, number][] = r.origin && !isInternal ? [r.origin, ...stopPts] : stopPts

      // Route line (casing + core) for real vehicle routes only — not loose pins.
      if (linePts.length >= 2 && !isInternal) {
        const srcId = `route-${r.id}`
        this._map.addSource(srcId, { type: 'geojson', data: this._lineFeature(linePts) })
        this._sourceIds.push(srcId)
        const casingId = `${srcId}-casing`
        const coreId = `${srcId}-core`
        this._map.addLayer({ id: casingId, type: 'line', source: srcId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 } })
        this._map.addLayer({ id: coreId, type: 'line', source: srcId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': r.color, 'line-width': 3.5, 'line-opacity': 0.85 } })
        this._layerIds.push(casingId, coreId)
        void this._upgradeGeometry(srcId, r, linePts)
      }

      // Depot / start marker (small rounded square) at the route origin.
      if (r.origin && !isInternal) {
        const el = document.createElement('div')
        el.className = 'vm-depot'
        el.style.background = r.color
        el.title = `${r.name} · xuất phát`
        const mk = new gl.Marker({ element: el, anchor: 'center' }).setLngLat(r.origin).addTo(this._map)
        this._markers.push(mk)
        bounds.extend(r.origin)
      }

      for (const s of r.stops) {
        const el = document.createElement('div')
        el.className = 'vm-pin'
        el.style.border = `2.5px solid ${r.color}`
        el.style.color = r.color
        el.textContent = s.index > 0 ? String(s.index) : ''
        el.title = s.label
        const mk = new gl.Marker({ element: el, anchor: 'center' }).setLngLat([s.lng, s.lat]).addTo(this._map)
        if (!isInternal) {
          el.addEventListener('click', (ev) => {
            ev.stopPropagation()
            new gl.Popup({ offset: 16, anchor: 'bottom' })
              .setLngLat([s.lng, s.lat])
              .setHTML(this._popupHtml(s))
              .addTo(this._map)
          })
        }
        this._markers.push(mk)
        bounds.extend([s.lng, s.lat])
      }
    }
    if (!bounds.isEmpty()) this._map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 600 })
  }

  private _popupHtml(s: MapStop): string {
    const role = s.role ? `<span class="rb" style="background:${ROLE_COLOR[s.role]}">${ROLE_LABEL[s.role]}</span> ` : ''
    const eta = s.eta ? `<span class="eta">${escapeHtml(s.eta)}</span>` : ''
    const num = s.index > 0 ? `${s.index}. ` : ''
    return `<div class="vm-pop"><b>${num}${escapeHtml(s.label)}</b>${role}${eta}</div>`
  }

  /** Fetch real road geometry and swap it into the route source when it arrives. */
  private async _upgradeGeometry(srcId: string, r: MapRoute, linePts: [number, number][]) {
    const sig = `${r.profile ?? 'car'}|${linePts.map((c) => c.join(',')).join(';')}`
    const cached = this._geomCache.get(sig)
    if (cached) {
      this._setSource(srcId, cached)
      return
    }
    const coords = await fetchRoadGeometry(this.tileKey, r.profile ?? 'car', linePts)
    if (coords) {
      this._geomCache.set(sig, coords)
      this._setSource(srcId, coords)
    }
  }

  private _setSource(srcId: string, coords: [number, number][]) {
    const src = this._map?.getSource(srcId)
    if (src) src.setData(this._lineFeature(coords))
  }

  render() {
    return html`<div class="map"></div>`
  }
}

if (!customElements.get('vietmap-route-map')) {
  customElements.define('vietmap-route-map', VietmapRouteMap)
}
