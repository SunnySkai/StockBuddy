import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useSession } from '../../context/SessionContext'
import { searchFixturesByName } from '../../api/events'
import type { FixtureSearchSuggestion } from '../../types/events'

type FixtureSearchProps = {
  onSelect?: (fixture: FixtureSearchSuggestion) => void
  placeholder?: string
  label?: string
  selectedFixture?: FixtureSearchSuggestion | null
  upcomingOnly?: boolean
  limit?: number
}

const FixtureSearch = ({
  onSelect,
  placeholder = 'Search fixtures by club or matchup...',
  label = 'Find fixtures',
  selectedFixture,
  upcomingOnly = true,
  limit
}: FixtureSearchProps) => {
  const { token } = useSession()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<FixtureSearchSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<number>(1000)

  const {
    normalizedQuery,
    normalizedTokens,
    homeTokens,
    awayTokens
  } = useMemo(() => {
    const trimmed = query.replace(/\s+/g, ' ').trim()
    if (!trimmed) {
      return { normalizedQuery: '', normalizedTokens: [], homeTokens: [], awayTokens: [] }
    }
    const splitRegex = /\s+(?:vs|vs\.|v|v\.|@)\s+/i
    const [homeSegment, awaySegment] = trimmed.split(splitRegex)
    const sanitizeTokens = (segment?: string) =>
      segment
        ? segment
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
        : []
    const homeTokens = sanitizeTokens(homeSegment)
    const awayTokens = sanitizeTokens(awaySegment)
    const normalizedQuery = trimmed
      .replace(/\b(?:vs|vs\.|v|v\.|@)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const normalizedTokens = normalizedQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
    return { normalizedQuery, normalizedTokens, homeTokens, awayTokens }
  }, [query])

  const candidateQueries = useMemo(() => {
    const candidates = new Set<string>()
    if (normalizedQuery) candidates.add(normalizedQuery)
    if (homeTokens.length) candidates.add(homeTokens.join(' '))
    if (awayTokens.length) candidates.add(awayTokens.join(' '))
    normalizedTokens.forEach(token => candidates.add(token))
    return Array.from(candidates).filter(entry => entry.trim().length)
  }, [awayTokens, homeTokens, normalizedQuery, normalizedTokens])

  const filterSuggestions = useCallback(
    (fixtures: FixtureSearchSuggestion[]) => {
      if (!normalizedTokens.length) {
        return fixtures
      }
      return fixtures.filter(fixture => {
        const homeName = fixture.home_team.toLowerCase()
        const awayName = fixture.away_team.toLowerCase()
        if (homeTokens.length && !homeTokens.every(token => homeName.includes(token))) {
          return false
        }
        if (awayTokens.length && !awayTokens.every(token => awayName.includes(token))) {
          return false
        }
        if (!homeTokens.length && !awayTokens.length) {
          const haystack = `${homeName} ${awayName}`
          return normalizedTokens.every(token => haystack.includes(token))
        }
        return true
      })
    },
    [awayTokens, homeTokens, normalizedTokens]
  )

  useEffect(() => {
    if (!token) return
    if (!candidateQueries.length) {
      setSuggestions([])
      setOpen(false)
      setError(null)
      abortRef.current?.abort()
      return
    }

    setError(null)
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }

    debounceRef.current = window.setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      try {
        const queries = candidateQueries.slice(0, 4)
        const responses = await Promise.all(
          queries.map(candidate =>
            searchFixturesByName(token, candidate, {
              signal: controller.signal,
              upcomingOnly,
              limit
            })
          )
        )
        if (controller.signal.aborted) {
          setLoading(false)
          return
        }
        const collected: FixtureSearchSuggestion[] = []
        const seen = new Set<string | number>()
        let fallbackError: string | null = null
        responses.forEach(result => {
          if (!result.ok) {
            fallbackError = fallbackError ?? result.error
            return
          }
          result.data.data.forEach(item => {
            const key = item.id ?? `${item.home_team}-${item.away_team}-${item.date}`
            if (!seen.has(key)) {
              seen.add(key)
              collected.push(item)
            }
          })
        })
        const filtered = filterSuggestions(collected)
        if (!filtered.length && fallbackError) {
          setError(fallbackError)
        } else {
          setError(null)
        }
        setSuggestions(filtered)
        setOpen(Boolean(filtered.length))
      } catch (error) {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Unable to search fixtures.'
        setError(message)
        setSuggestions([])
        setOpen(false)
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }, 350)

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current)
      }
    }
  }, [candidateQueries, filterSuggestions, limit, token, upcomingOnly])

  const handleSelect = useCallback((fixture: FixtureSearchSuggestion) => {
    onSelect?.(fixture)
    setQuery(`${fixture.home_team} vs ${fixture.away_team}`)
    setOpen(false)
  }, [onSelect])

  const suggestionList = useMemo(() => {
    if (!open || (!suggestions.length && !loading)) {
      return null
    }
    return (
      <ul className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
        {loading && !suggestions.length ? (
          <li className="px-4 py-3 text-sm text-slate-500">Searching...</li>
        ) : (
          suggestions.map(suggestion => (
            <li key={suggestion.id}>
              <button
                type="button"
                onMouseDown={event => {
                  event.preventDefault()
                  handleSelect(suggestion)
                }}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-indigo-50"
              >
                <div className="flex items-center gap-3">
                  {suggestion.home_logo ? (
                    <img
                      src={suggestion.home_logo}
                      alt={`${suggestion.home_team} logo`}
                      className="h-8 w-8 rounded-full border border-slate-200 bg-white object-contain p-1"
                      onError={event => {
                        event.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                      {suggestion.home_team.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-slate-900">
                      {suggestion.home_team} vs {suggestion.away_team}
                    </p>
                    <p className="text-xs text-slate-500">
                      {suggestion.date
                        ? new Date(suggestion.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                        : 'Date TBD'}
                    </p>
                  </div>
                </div>
                {suggestion.away_logo ? (
                  <img
                    src={suggestion.away_logo}
                    alt={`${suggestion.away_team} logo`}
                    className="h-8 w-8 rounded-full border border-slate-200 bg-white object-contain p-1"
                    onError={event => {
                      event.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                    {suggestion.away_team.charAt(0).toUpperCase()}
                  </div>
                )}
              </button>
            </li>
          ))
        )}
      </ul>
    )
  }, [handleSelect, loading, open, suggestions])

  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{label}</label>
      <div className="relative mt-2">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm focus-within:border-[#1d4ed8]">
          <Search className="h-5 w-5 text-[#1d4ed8]" />
          <input
            type="text"
            className="flex-1 border-none bg-transparent text-sm text-slate-700 outline-none"
            value={query}
            placeholder={placeholder}
            onChange={event => setQuery(event.target.value)}
            onFocus={() => {
              if (suggestions.length) {
                setOpen(true)
              }
            }}
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-[#1d4ed8]" />}
        </div>
        {error && <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
        {suggestionList}
      </div>
      {selectedFixture && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#cbd6ff] bg-white px-4 py-3 text-sm text-slate-600">
          {selectedFixture.home_logo ? (
            <img
              src={selectedFixture.home_logo}
              alt={`${selectedFixture.home_team} logo`}
              className="h-9 w-9 rounded-full border border-slate-200 bg-white object-contain p-1"
              onError={event => {
                event.currentTarget.style.visibility = 'hidden'
              }}
            />
          ) : null}
          <div className="flex-1">
            <p className="font-semibold text-slate-900">
              {selectedFixture.home_team} vs {selectedFixture.away_team}
            </p>
            <p className="text-xs text-slate-500">
              {selectedFixture.date
                ? new Date(selectedFixture.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                : 'Date to be confirmed'}
            </p>
          </div>
          {selectedFixture.away_logo ? (
            <img
              src={selectedFixture.away_logo}
              alt={`${selectedFixture.away_team} logo`}
              className="h-9 w-9 rounded-full border border-slate-200 bg-white object-contain p-1"
              onError={event => {
                event.currentTarget.style.visibility = 'hidden'
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

export default FixtureSearch
