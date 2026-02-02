import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { useSession } from './SessionContext'
import {
  fetchPinnedEvents,
  pinEvent as apiPinEvent,
  unpinEvent as apiUnpinEvent
} from '../api/events'
import type { PinnedEvent } from '../types/events'

type EventsState = {
  pinnedEvents: PinnedEvent[]
  loading: boolean
  error: string | null
}

type EventsContextValue = EventsState & {
  refreshPinned: () => Promise<void>
  pinFixture: (fixtureId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  unpinFixture: (fixtureId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  isPinned: (fixtureId: string) => boolean
}

const initialState: EventsState = {
  pinnedEvents: [],
  loading: false,
  error: null
}

const normalizePinnedLogos = (event: PinnedEvent): PinnedEvent => {
  const homeLogo = event.home_team_logo ?? event.home_logo ?? null
  const awayLogo = event.away_team_logo ?? event.away_logo ?? null
  return {
    ...event,
    home_team_logo: homeLogo,
    away_team_logo: awayLogo,
    home_logo: homeLogo,
    away_logo: awayLogo
  }
}

const EventsContext = createContext<EventsContextValue | undefined>(undefined)

const EventsProvider = ({ children }: { children: ReactNode }) => {
  const { status, token } = useSession()
  const [state, setState] = useState<EventsState>(initialState)
  const inflightRef = useRef<AbortController | null>(null)

  const resetState = useCallback(() => {
    setState(initialState)
  }, [])

  const loadPinned = useCallback(async () => {
    if (!token) return
    inflightRef.current?.abort()
    const controller = new AbortController()
    inflightRef.current = controller

    setState(prev => ({
      ...prev,
      loading: true,
      error: null
    }))

    const result = await fetchPinnedEvents(token)

    if (controller.signal.aborted) {
      return
    }

    if (!result.ok) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: result.error
      }))
      return
    }

    const upcoming = result.data.data.map(normalizePinnedLogos)
    setState({
      pinnedEvents: upcoming,
      loading: false,
      error: null
    })
  }, [token])

  useEffect(() => {
    if (status !== 'authenticated' || !token) {
      resetState()
      return
    }
    loadPinned()
    return () => {
      inflightRef.current?.abort()
    }
  }, [loadPinned, resetState, status, token])

  const refreshPinned = useCallback(async () => {
    if (!token) {
      resetState()
      return
    }
    await loadPinned()
  }, [loadPinned, resetState, token])

  const pinFixture = useCallback(
    async (fixtureId: string) => {
      if (!token) {
        return { ok: false as const, error: 'You must be signed in' }
      }
      const result = await apiPinEvent(token, fixtureId)
      if (!result.ok) {
        return { ok: false as const, error: result.error }
      }
      const pinned = normalizePinnedLogos(result.data.data)
      setState(prev => {
        const remaining = prev.pinnedEvents.filter(event => event.fixture_id !== fixtureId)
        return {
          ...prev,
          pinnedEvents: [pinned, ...remaining]
        }
      })
      return { ok: true as const }
    },
    [token]
  )

  const unpinFixture = useCallback(
    async (fixtureId: string) => {
      if (!token) {
        return { ok: false as const, error: 'You must be signed in' }
      }
      const result = await apiUnpinEvent(token, fixtureId)
      if (!result.ok) {
        return { ok: false as const, error: result.error }
      }
      setState(prev => ({
        ...prev,
        pinnedEvents: prev.pinnedEvents.filter(event => event.fixture_id !== fixtureId)
      }))
      return { ok: true as const }
    },
    [token]
  )

  const value = useMemo<EventsContextValue>(
    () => ({
      ...state,
      refreshPinned,
      pinFixture,
      unpinFixture,
      isPinned: (fixtureId: string) => state.pinnedEvents.some(event => event.fixture_id === fixtureId)
    }),
    [pinFixture, refreshPinned, state, unpinFixture]
  )

  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>
}

const useEvents = (): EventsContextValue => {
  const context = useContext(EventsContext)
  if (!context) {
    throw new Error('useEvents must be used within an EventsProvider')
  }
  return context
}

export { EventsProvider, useEvents }
