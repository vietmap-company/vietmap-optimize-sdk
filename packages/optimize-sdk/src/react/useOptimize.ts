import { useCallback, useRef, useState } from 'react'
import type { OptimizeRequest, OptimizeResponse, SdkError } from '../index'
import { useFleetworkClient } from './FleetworkProvider'

export interface UseOptimizeResult {
  data: OptimizeResponse | undefined
  isLoading: boolean
  error: SdkError | null
  optimize: (request: OptimizeRequest) => Promise<OptimizeResponse | undefined>
  reset: () => void
}

/**
 * Mutation-style hook wrapping `client.optimize`. Requires a `<FleetworkProvider>`
 * ancestor. Stale results from superseded calls are ignored.
 */
export function useOptimize(): UseOptimizeResult {
  const client = useFleetworkClient()
  const [data, setData] = useState<OptimizeResponse | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<SdkError | null>(null)
  const runIdRef = useRef(0)

  const optimize = useCallback(
    async (request: OptimizeRequest) => {
      const runId = ++runIdRef.current
      setIsLoading(true)
      setError(null)
      try {
        const res = await client.optimize(request)
        if (runId === runIdRef.current) setData(res)
        return res
      } catch (e) {
        if (runId === runIdRef.current) setError(e as SdkError)
        return undefined
      } finally {
        if (runId === runIdRef.current) setIsLoading(false)
      }
    },
    [client],
  )

  const reset = useCallback(() => {
    runIdRef.current++
    setData(undefined)
    setError(null)
    setIsLoading(false)
  }, [])

  return { data, isLoading, error, optimize, reset }
}
