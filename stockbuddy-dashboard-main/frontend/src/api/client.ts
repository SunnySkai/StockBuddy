const API_BASE_URL = (import.meta as any).env.VITE_APP_API_BASE_URL as string

const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.'

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number }

export type DownloadPayload = {
  blob: Blob
  filename?: string
  contentType: string
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  token?: string | null
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

type UploadRequestOptions = Omit<RequestOptions, 'body'> & {
  method?: 'POST' | 'PUT'
}

type DownloadRequestOptions = Omit<RequestOptions, 'body'>

const normalizeCandidate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const resolveErrorMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return DEFAULT_ERROR_MESSAGE

  if ('message' in payload) {
    const message = normalizeCandidate((payload as { message?: unknown }).message)
    if (message) return message
  }

  if ('errors' in payload) {
    const errors = (payload as { errors?: unknown }).errors
    if (Array.isArray(errors)) {
      const messages = errors
        .map(normalizeCandidate)
        .filter((message): message is string => Boolean(message))
      if (messages.length > 0) {
        return messages.join(', ')
      }
    }
    if (errors && typeof errors === 'object') {
      for (const value of Object.values(errors as Record<string, unknown>)) {
        if (Array.isArray(value)) {
          const firstMessage = value.map(normalizeCandidate).find(Boolean)
          if (firstMessage) return firstMessage
          continue
        }
        const message = normalizeCandidate(value)
        if (message) return message
      }
    }
    const single = normalizeCandidate(errors)
    if (single) {
      return single
    }
  }

  if ('detail' in payload) {
    const detail = normalizeCandidate((payload as { detail?: unknown }).detail)
    if (detail) return detail
  }

  if ('title' in payload) {
    const title = normalizeCandidate((payload as { title?: unknown }).title)
    if (title) return title
  }

  if ('error' in payload) {
    const errorMessage = normalizeCandidate((payload as { error?: unknown }).error)
    if (errorMessage) return errorMessage
  }

  if ('reason' in payload) {
    const reason = normalizeCandidate((payload as { reason?: unknown }).reason)
    if (reason) return reason
  }

  if ('description' in payload) {
    const description = normalizeCandidate((payload as { description?: unknown }).description)
    if (description) return description
  }

  if ('statusText' in payload) {
    const statusText = normalizeCandidate((payload as { statusText?: unknown }).statusText)
    if (statusText) return statusText
  }

  if ('status_message' in (payload as Record<string, unknown>)) {
    const statusMessage = normalizeCandidate((payload as Record<string, unknown>).status_message)
    if (statusMessage) return statusMessage
  }

  if ('error_description' in (payload as Record<string, unknown>)) {
    const errorDescription = normalizeCandidate((payload as Record<string, unknown>).error_description)
    if (errorDescription) return errorDescription
  }

  if ('errorMessage' in (payload as Record<string, unknown>)) {
    const errorMessage = normalizeCandidate((payload as Record<string, unknown>).errorMessage)
    if (errorMessage) return errorMessage
  }

  if ('error_messages' in (payload as Record<string, unknown>)) {
    const messages = (payload as Record<string, unknown>).error_messages
    if (Array.isArray(messages)) {
      const first = messages.map(normalizeCandidate).find(Boolean)
      if (first) return first
    }
  }

  return DEFAULT_ERROR_MESSAGE
}

const parseFilenameFromDisposition = (value: string | null): string | undefined => {
  if (!value) return undefined
  const filenameMatch = value.match(/filename\*?=(?:UTF-8'')?("?)([^";]+)\1/i)
  if (!filenameMatch) return undefined
  try {
    return decodeURIComponent(filenameMatch[2])
  } catch {
    return filenameMatch[2]
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', token, body, headers, signal } = options

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers ?? {})
  }

  if (token) {
    requestHeaders.authorization = `Bearer ${token}`
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal
    })

    const status = response.status
    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        ok: false,
        error: resolveErrorMessage(payload),
        status
      }
    }

    return { ok: true, data: payload as T, status }
  } catch (error) {
    const message = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE
    return { ok: false, error: message, status: 0 }
  }
}

export const apiGet = <T>(path: string, options: Omit<RequestOptions, 'method'> = {}) =>
  apiRequest<T>(path, { ...options, method: 'GET' })

export const apiPost = <T>(path: string, body: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
  apiRequest<T>(path, { ...options, method: 'POST', body })

export const apiPatch = <T>(path: string, body: unknown, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
  apiRequest<T>(path, { ...options, method: 'PATCH', body })

export const apiDelete = <T>(path: string, options: Omit<RequestOptions, 'method'> = {}) =>
  apiRequest<T>(path, { ...options, method: 'DELETE' })

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: UploadRequestOptions = {}
): Promise<ApiResult<T>> {
  const { method = 'POST', token, headers, signal } = options
  const requestHeaders: Record<string, string> = {
    ...(headers ?? {})
  }
  if (token) {
    requestHeaders.authorization = `Bearer ${token}`
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      body: formData,
      signal
    })
    const status = response.status
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      return { ok: false, error: resolveErrorMessage(payload), status }
    }
    return { ok: true, data: payload as T, status }
  } catch (error) {
    const message = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE
    return { ok: false, error: message, status: 0 }
  }
}

export async function apiDownload(
  path: string,
  options: DownloadRequestOptions = {}
): Promise<ApiResult<DownloadPayload>> {
  const { method = 'GET', token, headers, signal } = options
  const requestHeaders: Record<string, string> = {
    ...(headers ?? {})
  }
  if (token) {
    requestHeaders.authorization = `Bearer ${token}`
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: requestHeaders,
      signal
    })
    const status = response.status
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null)
      return { ok: false, error: resolveErrorMessage(payload), status }
    }
    const blob = await response.blob()
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream'
    const filename = parseFilenameFromDisposition(response.headers.get('content-disposition'))
    return { ok: true, data: { blob, filename, contentType }, status }
  } catch (error) {
    const message = error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE
    return { ok: false, error: message, status: 0 }
  }
}
