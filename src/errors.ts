import type { SdkError } from './types'

/**
 * Backend may return any of `{ error, message, detail, status, errors[] }`.
 * Pick the first non-empty string. Priority: message > status > detail > errors[0] > error.
 */
export function extractErrorMessage(payload: unknown, fallback?: string): string {
  const fields: (string | undefined)[] = []
  if (typeof payload === 'object' && payload !== null) {
    const obj = payload as Record<string, unknown>
    for (const key of ['message', 'status', 'detail']) {
      const v = obj[key]
      if (typeof v === 'string' && v.length > 0) fields.push(v)
    }
    const errors = obj.errors
    if (Array.isArray(errors) && errors.length > 0 && typeof errors[0] === 'string') {
      fields.push(errors[0])
    }
    const error = obj.error
    if (typeof error === 'string' && error.length > 0) fields.push(error)
  }
  fields.push(fallback)
  return fields.find((v) => typeof v === 'string' && v.length > 0) ?? 'Request failed'
}

export function httpError(status: number, payload: unknown): SdkError {
  const err: SdkError = new Error(extractErrorMessage(payload))
  err.status = status
  return err
}

export function isAuthStatus(status: number): status is 401 | 403 {
  return status === 401 || status === 403
}
