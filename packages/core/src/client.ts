import type {
  AuthErrorEvent,
  OptimizeClientConfig,
  OptimizeRequest,
  OptimizeResponse,
  SdkError,
} from './types'
import { extractErrorMessage, httpError, isAuthStatus } from './errors'

const DEFAULT_BASE_URL = 'https://live.fleetwork.vn/api/v1'
const DEFAULT_TIMEOUT = 5 * 60_000

export interface OptimizeCallOptions {
  /** Abort the request from the caller side (in addition to the timeout). */
  signal?: AbortSignal
}

function assertValidRequest(request: OptimizeRequest): void {
  if (!request || typeof request !== 'object') {
    throw new Error('[Optimize SDK] `request` object is required.')
  }
  if (!Array.isArray(request.vehicles) || request.vehicles.length === 0) {
    throw new Error('[Optimize SDK] `vehicles` is required and must contain at least one vehicle.')
  }
  const hasJobs = Array.isArray(request.jobs) && request.jobs.length > 0
  const hasShipments = Array.isArray(request.shipments) && request.shipments.length > 0
  if (!hasJobs && !hasShipments) {
    throw new Error('[Optimize SDK] Provide at least one of `jobs` or `shipments`.')
  }
}

/**
 * Framework-agnostic Optimize client. Uses the global `fetch`, so it runs in the
 * browser, Node >= 18, Deno, workers, and any framework.
 *
 * ```ts
 * const client = new VietmapOptimize({ apiKey: 'YOUR_KEY' })
 * const result = await client.optimize(request)
 * ```
 */
export class VietmapOptimize {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly onAuthError?: (event: AuthErrorEvent) => void

  constructor(config: OptimizeClientConfig) {
    if (!config) {
      throw new Error('[Optimize SDK] config with an `apiKey` is required.')
    }
    // Allow an empty key at construction (e.g. a React provider mounted before
    // the user has entered one) — a keyless request simply returns 401.
    this.apiKey = config.apiKey ?? ''
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT
    this.onAuthError = config.onAuthError

    let f = config.fetch
    if (!f) {
      if (typeof globalThis.fetch !== 'function') {
        throw new Error('[Optimize SDK] No global `fetch` found. Pass `fetch` in config (Node < 18 or a polyfill).')
      }
      f = globalThis.fetch.bind(globalThis)
    }
    this.fetchImpl = f
  }

  /** Solve a vehicle-routing problem: `POST {baseUrl}/optimize`. */
  async optimize(request: OptimizeRequest, options: OptimizeCallOptions = {}): Promise<OptimizeResponse> {
    assertValidRequest(request)
    return this.post<OptimizeResponse>('/optimize', request, options.signal)
  }

  private async post<T>(path: string, body: unknown, external?: AbortSignal): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    const onExternalAbort = () => controller.abort()
    if (external) {
      if (external.aborted) controller.abort()
      else external.addEventListener('abort', onExternalAbort)
    }

    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (e) {
      const err: SdkError = new Error(
        controller.signal.aborted
          ? '[Optimize SDK] Request timed out or was aborted.'
          : e instanceof Error
            ? e.message
            : 'Network error',
      )
      throw err
    } finally {
      clearTimeout(timer)
      if (external) external.removeEventListener('abort', onExternalAbort)
    }

    const data: unknown = await res.json().catch(() => undefined)
    if (!res.ok) {
      if (isAuthStatus(res.status) && this.onAuthError) {
        this.onAuthError({ status: res.status, message: extractErrorMessage(data), url: path, method: 'POST', payload: data })
      }
      throw httpError(res.status, data)
    }
    return data as T
  }
}
