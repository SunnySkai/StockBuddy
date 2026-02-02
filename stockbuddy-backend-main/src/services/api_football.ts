import https from 'https'
import { URL } from 'url'
import { TTLCache } from './cache'

type QueryParamValue = string | number | boolean | undefined | null
type BaseQueryParams = Record<string, QueryParamValue>

interface RequestOptions {
  ttlMs?: number
}

type FixturesQueryParams = BaseQueryParams & {
  date?: string
  league?: string
  season?: string
  team?: string
  next?: number | string
  timezone?: string
  status?: string
  live?: string
  fixture?: string
  from?: string
  to?: string
  search?: string
}

type FixtureEventsQueryParams = BaseQueryParams & {
  fixture: string
  team?: string
  player?: string
  type?: string
}

type LeaguesQueryParams = BaseQueryParams & {
  country?: string
  season?: string
  type?: string
  team?: string
  current?: boolean | string
}

type TeamsQueryParams = BaseQueryParams & {
  id?: string | number
  name?: string
  country?: string
  league?: string
  search?: string
  season?: string | number
}

interface ApiFootballResponse<T> {
  get: string
  parameters: Record<string, unknown>
  errors: Record<string, unknown>
  results: number
  paging: {
    current: number
    total: number
  }
  response: T
}

const DEFAULT_BASE_URL = process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io'
const DEFAULT_HOST = process.env.API_FOOTBALL_HOST
const PROVIDER = (process.env.API_FOOTBALL_PROVIDER || 'apisports').toLowerCase()
const ENV_TTL = parseInt(process.env.API_FOOTBALL_CACHE_TTL_MS || '', 10)
const DEFAULT_TTL_MS = Number.isNaN(ENV_TTL) ? 300_000 : ENV_TTL

const isPositiveNumber = (value: number | undefined): value is number => {
  return typeof value === 'number' && !Number.isNaN(value) && value > 0
}

const stableQueryKey = (path: string, params?: Record<string, QueryParamValue>): string => {
  if (!params || Object.keys(params).length === 0) {
    return path
  }

  const sortedEntries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)

  return `${path}?${sortedEntries.join('&')}`
}

export class ApiFootballClient {
  private readonly baseUrl: string
  private readonly host?: string
  private readonly cache?: TTLCache<unknown>
  private readonly cachingEnabled: boolean
  private readonly provider: 'rapidapi' | 'apisports'

  constructor(baseUrl: string = DEFAULT_BASE_URL, host: string | undefined = DEFAULT_HOST) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    this.host = host
    this.provider = PROVIDER === 'rapidapi' ? 'rapidapi' : 'apisports'

    if (isPositiveNumber(DEFAULT_TTL_MS)) {
      this.cache = new TTLCache(DEFAULT_TTL_MS)
      this.cachingEnabled = true
    } else {
      this.cache = undefined
      this.cachingEnabled = false
    }
  }

  async getFixtures<T = unknown>(params: FixturesQueryParams, options?: RequestOptions): Promise<ApiFootballResponse<T>> {
    return this.request<ApiFootballResponse<T>>('fixtures', params, options)
  }

  async getFixtureById<T = unknown>(fixtureId: string, options?: RequestOptions): Promise<ApiFootballResponse<T>> {
    return this.request<ApiFootballResponse<T>>('fixtures', { id: fixtureId }, options)
  }

  async getFixtureEvents<T = unknown>(params: FixtureEventsQueryParams, options?: RequestOptions): Promise<ApiFootballResponse<T>> {
    return this.request<ApiFootballResponse<T>>('fixtures/events', params, options)
  }

  async getLeagues<T = unknown>(params: LeaguesQueryParams, options?: RequestOptions): Promise<ApiFootballResponse<T>> {
    return this.request<ApiFootballResponse<T>>('leagues', params, options)
  }

  async getTeams<T = unknown>(params: TeamsQueryParams, options?: RequestOptions): Promise<ApiFootballResponse<T>> {
    return this.request<ApiFootballResponse<T>>('teams', params, options)
  }

  async searchFixtures<T = unknown>(search: string, params?: FixturesQueryParams, options?: RequestOptions): Promise<ApiFootballResponse<T>> {
    const mergedParams: FixturesQueryParams = { ...(params ?? {}), search }
    return this.request<ApiFootballResponse<T>>('fixtures', mergedParams, {
      ttlMs: 20_000,
      ...options
    })
  }

  private async request<T>(
    path: string,
    params?: BaseQueryParams,
    options?: RequestOptions
  ): Promise<T> {
    const apiKey = process.env.API_FOOTBALL_KEY
    if (!apiKey) {
      throw new Error(`API_FOOTBALL_KEY environment variable is not set`)
    }

    const url = new URL(path, this.baseUrl)

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') {
          return
        }
        url.searchParams.set(key, String(value))
      })
    }

    const cacheKey = stableQueryKey(path, params)
    if (this.cachingEnabled && this.cache) {
      const cached = this.cache.get(cacheKey)
      if (cached) {
        return cached as T
      }
    }

    const headers = this.buildHeaders(apiKey)
    const payload = await this.httpGet<T>(url, headers)

    if (this.cachingEnabled && this.cache) {
      this.cache.set(cacheKey, payload, options?.ttlMs)
    }

    return payload
  }

  private async httpGet<T>(url: URL, headers: Record<string, string>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request = https.request(
        url,
        {
          method: 'GET',
          headers,
          timeout: parseInt(process.env.API_FOOTBALL_HTTP_TIMEOUT_MS || '', 10) || 8000
        },
        (response) => {
          const chunks: Uint8Array[] = []

          response.on('data', (chunk: Uint8Array) => {
            chunks.push(chunk)
          })

          response.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8')
            const statusCode = response.statusCode ?? 0

            if (statusCode < 200 || statusCode >= 300) {
              let parsedMessage: string | undefined
              try {
                const parsedBody = JSON.parse(body)
                const maybeMessage = (parsedBody && typeof parsedBody === 'object' && 'message' in parsedBody)
                  ? (parsedBody as Record<string, unknown>).message
                  : undefined
                if (typeof maybeMessage === 'string' && maybeMessage.trim().length) {
                  parsedMessage = maybeMessage.trim()
                }
              } catch {
                // Ignore JSON parse errors – we'll fall back to raw body text.
              }

              let errorMessage = `API Football request failed: ${statusCode}`
              const fallbackMessage = body.trim().slice(0, 200)

              if (statusCode === 403 && parsedMessage && /not subscribed/i.test(parsedMessage)) {
                errorMessage = 'API Football subscription is not active for this request.'
              } else if (parsedMessage && parsedMessage.length) {
                errorMessage = `${errorMessage} - ${parsedMessage}`
              } else if (fallbackMessage.length) {
                errorMessage = `${errorMessage} - ${fallbackMessage}`
              }

              reject(new ApiFootballRequestError(errorMessage, statusCode))
              return
            }

            try {
              resolve(JSON.parse(body) as T)
            } catch (error) {
              reject(new Error(`Failed to parse API Football response: ${(error as Error).message}`))
            }
          })
        }
      )

      request.on('timeout', () => {
        request.destroy(new Error('API Football request timed out'))
      })

      request.on('error', (error: Error) => {
        reject(error)
      })

      request.end()
    })
  }

  private buildHeaders(apiKey: string): Record<string, string> {
    if (this.provider === 'rapidapi') {
      return {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': this.host ?? 'api-football-v1.p.rapidapi.com'
      }
    }

    const headers: Record<string, string> = {
      'x-apisports-key': apiKey
    }

    if (this.host) {
      headers['x-apisports-host'] = this.host
    }

    return headers
  }
}

export const apiFootballClient = new ApiFootballClient()
export class ApiFootballRequestError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'ApiFootballRequestError'
    this.statusCode = statusCode
  }
}
