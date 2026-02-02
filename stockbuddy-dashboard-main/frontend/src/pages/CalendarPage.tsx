import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  MapPin,
  Users,
  ChevronDown
} from 'lucide-react'
import DashboardLayout from '../components/DashboardLayout'
import { useSession } from '../context/SessionContext'
import { fetchFootballLeagues, fetchFootballLeagueFixtures } from '../api/events'
import { fetchPersonalEvents, createPersonalEvent, updatePersonalEvent, deletePersonalEvent } from '../api/personalEvents'
import PersonalCalendarGrid from '../components/calendar/PersonalCalendarGrid'
import PersonalEventModal from '../components/calendar/PersonalEventModal'
import type { FootballFixture, FootballLeague, FootballFixtureTeam } from '../types/events'
import type { PersonalEvent } from '../types/personalEvents'

const PREMIER_LEAGUE_ID = '39'
const PREMIER_LEAGUE_NAME = 'Premier League'

const buildYearRange = () => {
  const current = new Date()
  const minYear = 2025
  const maxDate = new Date(current)
  maxDate.setFullYear(current.getFullYear() + 1)
  const maxYear = maxDate.getFullYear()
  const years: number[] = []
  for (let y = minYear; y <= maxYear; y += 1) {
    years.push(y)
  }
  return years
}

const YEARS = buildYearRange()

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const clampYear = (year: number): number => {
  if (year < YEARS[0]) return YEARS[0]
  const maxYear = YEARS[YEARS.length - 1]
  if (year > maxYear) return maxYear
  return year
}

const determineSeasonYearsForCalendarYear = (year: number): number[] => {
  if (!Number.isFinite(year)) return []
  const seasons = new Set<number>([year])
  if (year > 0) {
    seasons.add(year - 1)
  }
  return Array.from(seasons)
}

const formatDateKey = (date: string | null): string | null => {
  if (!date) return null
  const time = Date.parse(date)
  if (Number.isNaN(time)) return null
  return new Date(time).toISOString().split('T')[0]
}

type MutableFixtureTeams = {
  home: FootballFixtureTeam
  away: FootballFixtureTeam
}
type FixtureTeamInput = string | null | undefined | Record<string, unknown>
type FixtureTeamsInput = Record<string, unknown> | null | undefined
type FixtureLike = Record<string, unknown> | null | undefined

type InventoryFixtureSummary = {
  id: string
  title: string
  date: string | null
  homeTeam: string | null
  awayTeam: string | null
  homeLogo: string | null
  awayLogo: string | null
}

const fixtureHasTitle = (fixture: FootballFixture): boolean => {
  return 'title' in (fixture as Record<string, unknown>) && typeof (fixture as any).title === 'string'
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const readString = (source: FixtureLike, key: string): string | null => {
  if (!isRecord(source)) return null
  const value = source[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

const readRecord = (source: FixtureLike, key: string): Record<string, unknown> | null => {
  if (!isRecord(source)) return null
  const value = source[key]
  return isRecord(value) ? value : null
}

const toTeamName = (team: FixtureTeamInput): string => {
  if (typeof team === 'string') return team
  if (isRecord(team) && typeof team.name === 'string') {
    return team.name
  }
  return ''
}

const getTeamLabel = (
  team: FixtureTeamInput,
  teamKey?: 'home' | 'away',
  teamsObj?: FixtureTeamsInput
): string => {
  const primary = toTeamName(team)
  if (primary) return primary
  if (teamKey && isRecord(teamsObj)) {
    const fallback = teamsObj[teamKey]
    if (typeof fallback === 'string') return fallback
  }
  return ''
}

const resolveTeamLogo = (
  fixture: FixtureLike,
  teams: FixtureTeamsInput,
  side: 'home' | 'away'
): string | null => {
  const direct =
    readString(fixture, `${side}_team_logo`) ??
    readString(fixture, `${side}_logo`) ??
    readString(teams, `${side}_team_logo`) ??
    readString(teams, `${side}_logo`) ??
    readString(teams, `${side}Logo`) ??
    readString(fixture, `${side}Logo`)
  if (direct) return direct
  const nestedTeam =
    readRecord(teams, side) ?? readRecord(fixture, side) ?? undefined
  if (nestedTeam) {
    const nestedLogo = readString(nestedTeam, 'logo')
    if (nestedLogo) return nestedLogo
  }
  return null
}

const normalizeTeams = (teams: FixtureTeamsInput, fixture?: FixtureLike): MutableFixtureTeams => {
  if (
    isRecord(teams) &&
    isRecord(teams.home) &&
    isRecord(teams.away) &&
    typeof teams.home.name === 'string' &&
    typeof teams.away.name === 'string'
  ) {
    return {
      home: {
        name: teams.home.name,
        logo: readString(teams.home, 'logo')
      },
      away: {
        name: teams.away.name,
        logo: readString(teams.away, 'logo')
      }
    }
  }
  const teamsRecord = isRecord(teams) ? teams : {}
  const homeName = getTeamLabel(teamsRecord.home as FixtureTeamInput, 'home', teamsRecord)
  const awayName = getTeamLabel(teamsRecord.away as FixtureTeamInput, 'away', teamsRecord)
  return {
    home: {
      name: homeName,
      logo: resolveTeamLogo(fixture ?? null, teamsRecord, 'home')
    },
    away: {
      name: awayName,
      logo: resolveTeamLogo(fixture ?? null, teamsRecord, 'away')
    }
  }
}

const mapFixtureLogos = (fixture: FootballFixture): FootballFixture => {
  const newTeams = normalizeTeams(fixture.teams as FixtureTeamsInput, fixture as FixtureLike)
  return {
    ...fixture,
    teams: {
      home: newTeams.home.name ?? '',
      away: newTeams.away.name ?? '',
      homeLogo: newTeams.home.logo ?? '',
      awayLogo: newTeams.away.logo ?? '',
    }
  }
}

const buildInventoryFixtureSummary = (fixture: FootballFixture): InventoryFixtureSummary => {
  const teams = normalizeTeams(fixture.teams as FixtureTeamsInput, fixture as FixtureLike)
  const home = getTeamLabel(teams.home) || teams.home.name || null
  const away = getTeamLabel(teams.away) || teams.away.name || null
  const fallbackTitle =
    home && away ? `${home} vs ${away}` : fixture.league?.name ?? `Fixture ${fixture.id}`
  const title = (fixtureHasTitle(fixture) ? (fixture as any).title : undefined) ?? fallbackTitle
  return {
    id: String(fixture.id),
    title,
    date: fixture.date ?? null,
    homeTeam: home,
    awayTeam: away,
    homeLogo: teams.home.logo ?? null,
    awayLogo: teams.away.logo ?? null
  }
}

const formatPrettyDate = (isoDate: string | null) => {
  if (!isoDate) return 'Date TBC'
  const time = Date.parse(isoDate)
  if (Number.isNaN(time)) return 'Date TBC'
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(time))
}

const formatPrettyTime = (isoDate: string | null) => {
  if (!isoDate) return 'Time TBC'
  const time = Date.parse(isoDate)
  if (Number.isNaN(time)) return 'Time TBC'
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(time))
}

// Helper for finding if we should show left/right popup beside event
const getPopupDirection = (element: HTMLElement | null) => {
  if (!element) return 'right'
  const rect = element.getBoundingClientRect()
  const windowWidth = window.innerWidth
  // If enough space right, use right, else left
  if (rect.right + 270 < windowWidth) return 'right'
  if (rect.left - 270 > 0) return 'left'
  const spaceRight = windowWidth - rect.right
  const spaceLeft = rect.left
  return spaceRight > spaceLeft ? 'right' : 'left'
}

const CalendarPage = () => {
  const { token } = useSession()
  const navigate = useNavigate()

  const today = new Date()
  const initialYear = (() => {
    const y = today.getFullYear()
    if (y < YEARS[0]) return YEARS[0]
    if (y > YEARS[YEARS.length - 1]) return YEARS[YEARS.length - 1]
    return y
  })()

  const [currentYear, setCurrentYear] = useState(initialYear)
  const [currentMonth, setCurrentMonth] = useState(today.getMonth())
  const [activeTab, setActiveTab] = useState<'matches' | 'personal'>('matches')
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>(PREMIER_LEAGUE_ID)
  const [selectedTeamName, setSelectedTeamName] = useState<string>('')
  const [leagues, setLeagues] = useState<FootballLeague[]>([])
  const [loadingLeagues, setLoadingLeagues] = useState(false)
  const [loadingFixtures, setLoadingFixtures] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fixtures, setFixtures] = useState<FootballFixture[]>([])
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([])
  const [loadingPersonalEvents, setLoadingPersonalEvents] = useState(false)

  const popupRef = useRef<HTMLDivElement | null>(null)
  const eventBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const [popupStyle, setPopupStyle] = useState<{
    top: number
    left: number
    direction: 'left' | 'right'
    visible: boolean
    arrowTopAdjust?: number
  }>({ top: 0, left: 0, direction: 'right', visible: false })

  const [popupFixture, setPopupFixture] = useState<FootballFixture | null>(null)
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null)

  const [animatedExpandedDayKey, setAnimatedExpandedDayKey] = useState<string | null>(null) // for animation

  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)

  const [editingEvent, setEditingEvent] = useState<PersonalEvent | null>(null)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formStartTime, setFormStartTime] = useState('')
  const [formEndTime, setFormEndTime] = useState('')
  const [formRepeat, setFormRepeat] =
    useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none')
  const [formRepeatUntil, setFormRepeatUntil] = useState('')
  const [formRemindMinutes, setFormRemindMinutes] = useState<number | null>(15)
  const [savingEvent, setSavingEvent] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [personalFormError, setPersonalFormError] = useState<string | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      setPopupStyle(prev => ({ ...prev, visible: false }))
    }
    if (popupStyle.visible) {
      window.addEventListener('scroll', handleScroll, true)
      return () => window.removeEventListener('scroll', handleScroll, true)
    }
  }, [popupStyle.visible])

  useEffect(() => {
    if (!token || activeTab !== 'matches') return
    let cancelled = false
    const abort = new AbortController()
    const loadLeagues = async () => {
      setLoadingLeagues(true)
      try {
        const result = await fetchFootballLeagues(token, { season: currentYear, country: 'England' }, { signal: abort.signal })
        if (!result.ok || cancelled) return
        const data = result.data.data
        setLeagues(data)
        if (!data.some(league => league.id === selectedLeagueId)) {
          const premier = data.find(league => league.name?.toLowerCase().includes('premier league'))
          setSelectedLeagueId(premier?.id ?? data[0]?.id ?? PREMIER_LEAGUE_ID)
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load leagues')
        }
      } finally {
        if (!cancelled) {
          setLoadingLeagues(false)
        }
      }
    }
    loadLeagues()
    return () => {
      cancelled = true
      abort.abort()
    }
  }, [token, currentYear, activeTab])

  useEffect(() => {
    if (!token || !selectedLeagueId || activeTab !== 'matches') return
    let cancelled = false
    const abort = new AbortController()
    const loadFixtures = async () => {
      setLoadingFixtures(true)
      setError(null)
      try {
        const seasons = determineSeasonYearsForCalendarYear(currentYear)
        const responses = await Promise.all(
          seasons.map(async seasonYear => {
            const result = await fetchFootballLeagueFixtures(
              token,
              selectedLeagueId,
              { season: seasonYear },
              { signal: abort.signal }
            )
            return { seasonYear, result }
          })
        )
        if (cancelled) return

        const successful = responses.filter(entry => entry.result.ok)
        if (!successful.length) {
          setFixtures([])
          setError('Failed to load fixtures')
          return
        }

        const fixtureMap = new Map<string, FootballFixture>()
        successful.forEach(entry => {
          entry.result.data.data.forEach(fixture => {
            const fixtureId = fixture.id ? String(fixture.id) : null
            if (!fixtureId) return
            if (!fixtureMap.has(fixtureId)) {
              fixtureMap.set(fixtureId, fixture)
            }
          })
        })

        const from = `${currentYear}-01-01`
        const to = `${currentYear}-12-31`
        const raw = Array.from(fixtureMap.values()).filter(fixture => {
          const dateKey = formatDateKey(fixture.date)
          if (!dateKey) return false
          return dateKey >= from && dateKey <= to
        })
        const normalized = raw.map(mapFixtureLogos)
        setFixtures(normalized)
      } catch {
        if (!cancelled) {
          setError('Failed to load fixtures')
        }
      } finally {
        if (!cancelled) {
          setLoadingFixtures(false)
        }
      }
    }
    loadFixtures()
    return () => {
      cancelled = true
      abort.abort()
    }
  }, [token, selectedLeagueId, currentYear, activeTab])

  useEffect(() => {
    if (!token || activeTab !== 'personal') return
    let cancelled = false
    const abort = new AbortController()

    const loadEvents = async () => {
      setLoadingPersonalEvents(true)
      try {
        const from = `${currentYear}-01-01`
        const to = `${currentYear}-12-31`
        const result = await fetchPersonalEvents(token, { from, to }, { signal: abort.signal })
        if (!result.ok || cancelled) return
        setPersonalEvents(result.data.data)
      } catch {
        if (!cancelled) {
          setError('Failed to load personal events')
        }
      } finally {
        if (!cancelled) {
          setLoadingPersonalEvents(false)
        }
      }
    }

    loadEvents()
    return () => {
      cancelled = true
      abort.abort()
    }
  }, [token, currentYear, activeTab])

  const filteredFixtures = useMemo(() => {
    if (!selectedTeamName.trim()) return fixtures
    const q = selectedTeamName.trim().toLowerCase()
    return fixtures.filter(fixture => {
      const teams = normalizeTeams(fixture.teams as FixtureTeamsInput, fixture as FixtureLike)
      const home = teams.home.name ?? ''
      const away = teams.away.name ?? ''
      return home.toLowerCase().includes(q) || away.toLowerCase().includes(q)
    })
  }, [fixtures, selectedTeamName])

  const fixturesByDate = useMemo(() => {
    const map = new Map<string, FootballFixture[]>()
    filteredFixtures.forEach(fixture => {
      const key = formatDateKey(fixture.date)
      if (!key) return
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)?.push(fixture)
    })
    return map
  }, [filteredFixtures])

  const personalEventsByDate = useMemo(() => {
    const map = new Map<string, PersonalEvent[]>()
    personalEvents.forEach(event => {
      const key = event.start_time.split('T')[0]
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)?.push(event)
    })
    return map
  }, [personalEvents])

  const handleNavigateToInventory = (fixture: FootballFixture) => {
    const summary = buildInventoryFixtureSummary(fixture)
    navigate(`/inventory?game_id=${summary.id}`, { state: { fixture: summary } })
  }

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const delta = direction === 'next' ? 1 : -1
    let nextMonth = currentMonth + delta
    let nextYear = currentYear

    if (nextMonth > 11) {
      nextMonth = 0
      nextYear = clampYear(currentYear + 1)
    } else if (nextMonth < 0) {
      nextMonth = 11
      nextYear = clampYear(currentYear - 1)
    }

    if (nextYear !== currentYear) {
      setCurrentYear(nextYear)
    }
    setCurrentMonth(nextMonth)
  }

  const handleToday = () => {
    setCurrentYear(initialYear)
    setCurrentMonth(today.getMonth())
  }

  const openNewPersonalEvent = (dateKey: string) => {
    setEditingEvent(null)
    setEditingDate(dateKey)
    setFormTitle('')
    setFormDescription('')
    setFormLocation('')
    setFormStartTime(`${dateKey}T09:00`)
    setFormEndTime(`${dateKey}T10:00`)
    setFormRepeat('none')
    setFormRepeatUntil('')
    setFormRemindMinutes(15)
    setPersonalFormError(null)
    setShowEventModal(true)
  }

  const openEditPersonalEvent = (event: PersonalEvent) => {
    const dateKey = event.start_time.split('T')[0]
    setEditingEvent(event)
    setEditingDate(dateKey)
    setFormTitle(event.title)
    setFormDescription(event.description ?? '')
    setFormLocation(event.location ?? '')
    setFormStartTime(event.start_time)
    setFormEndTime(event.end_time ?? '')
    setFormRepeat(event.repeat)
    setFormRepeatUntil('')
    setFormRemindMinutes(event.remind_before_minutes ?? null)
    setShowEventModal(true)
    setPersonalFormError(null)
  }

  const handleSavePersonalEvent = async () => {
    if (!token || !editingDate || !formTitle.trim()) return
    setPersonalFormError(null)
    setSavingEvent(true)
    try {
      if (!editingEvent) {
        const body: any = {
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          start_time: formStartTime,
          end_time: formEndTime || undefined,
          location: formLocation.trim() || undefined,
          repeat: formRepeat,
          repeat_until: formRepeatUntil || undefined,
          remind_before_minutes: formRemindMinutes
        }
        const result = await createPersonalEvent(token, body)
        if (!result.ok) {
          setPersonalFormError(result.error)
          return
        }
        setPersonalEvents(prev => [...prev, ...result.data.data])
      } else {
        const body: any = {
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          start_time: formStartTime,
          end_time: formEndTime || null,
          location: formLocation.trim() || null,
          remind_before_minutes: formRemindMinutes
        }
        const result = await updatePersonalEvent(token, editingEvent.id, body)
        if (!result.ok) {
          setPersonalFormError(result.error)
          return
        }
        setPersonalEvents(prev =>
          prev.map(ev => (ev.id === editingEvent.id ? { ...ev, ...body } : ev))
        )
      }
      setShowEventModal(false)
    } finally {
      setSavingEvent(false)
    }
  }

  const handleDeletePersonalEvent = async (deleteSeries: boolean) => {
    if (!token || !editingEvent) return

    setPersonalFormError(null)
    setSavingEvent(true)
    try {
      const result = await deletePersonalEvent(
        token,
        editingEvent.id,
        deleteSeries ? { series: 'all' } : {}
      )
      if (!result.ok) {
        setPersonalFormError(result.error)
        return
      }
      setPersonalEvents(prev => {
        if (!deleteSeries) {
          return prev.filter(ev => ev.id !== editingEvent.id)
        }
        const seriesId = editingEvent.parent_event_id ?? editingEvent.id
        return prev.filter(ev => (ev.parent_event_id ?? ev.id) !== seriesId)
      })
      setShowEventModal(false)
      setShowDeleteConfirm(false)
    } finally {
      setSavingEvent(false)
    }
  }

  // Animate expand/collapse for day
  useEffect(() => {
    if (expandedDayKey !== null) {
      setAnimatedExpandedDayKey(expandedDayKey)
    } else {
      // Delay collapse until fade out transition finishes
      const timeout = setTimeout(() => setAnimatedExpandedDayKey(null), 150)
      return () => clearTimeout(timeout)
    }
  }, [expandedDayKey])

  const selectedLeague = useMemo(() => {
    const list = leagues.length
      ? leagues
      : [{ id: PREMIER_LEAGUE_ID, name: PREMIER_LEAGUE_NAME, type: 'league', logo: null, country: 'England', countryCode: 'GB', season: currentYear, seasons: [currentYear] }]
    return list.find(league => league.id === selectedLeagueId) ?? list[0]
  }, [leagues, selectedLeagueId, currentYear])

  const { weeks } = useMemo(() => {
    const firstOfMonth = new Date(currentYear, currentMonth, 1)
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    const cells: Date[] = []

    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push(new Date(currentYear, currentMonth, -i))
    }
    cells.reverse()

    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push(new Date(currentYear, currentMonth, d))
    }

    while (cells.length % 7 !== 0 || cells.length < 35) {
      cells.push(new Date(currentYear, currentMonth, daysInMonth + (cells.length - firstWeekday - daysInMonth) + 1))
    }

    const weeksLocal: Date[][] = []
    for (let i = 0; i < cells.length; i += 7) {
      weeksLocal.push(cells.slice(i, i + 7))
    }

    return { weeks: weeksLocal }
  }, [currentYear, currentMonth])

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = event => {
    touchStartX.current = event.touches[0]?.clientX ?? null
    touchEndX.current = null
  }

  const handleTouchMove: React.TouchEventHandler<HTMLDivElement> = event => {
    touchEndX.current = event.touches[0]?.clientX ?? null
  }

  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    if (touchStartX.current === null || touchEndX.current === null) return
    const diff = touchStartX.current - touchEndX.current
    const threshold = 50
    if (Math.abs(diff) < threshold) return
    if (diff > 0) {
      handleMonthChange('next')
    } else {
      handleMonthChange('prev')
    }
  }

  // Mouse enter logic to show popup beside event button
  const handleFixtureMouseEnter = (fixture: FootballFixture, e: React.MouseEvent<HTMLButtonElement>) => {
    setPopupFixture(fixture)
    const btn = e.currentTarget
    eventBtnRefs.current[String(fixture.id)] = btn
    setTimeout(() => {
      const rect = btn.getBoundingClientRect()
      const direction = getPopupDirection(btn)

      const container = document.querySelector('.calendar-outer-container') as HTMLElement
      const containerRect = container ? container.getBoundingClientRect() : { top: 0, left: 0 }

      // Calculate top, left (relative to container)
      let top = rect.top - containerRect.top + btn.offsetHeight / 2 - 24
      let left =
        direction === 'right'
          ? rect.right - containerRect.left + 10
          : rect.left - containerRect.left - 265

      // Clamp top so widget stays inside container (visible and doesn't overflow below)
      let minTop = 8
      let containerHeight = container ? container.offsetHeight : window.innerHeight
      let maxTop = containerHeight - 180
      let arrowTopAdjust = 0

      if (top < minTop) top = minTop

      // If popup would overflow bottom of container, shift up so the whole popup is visible.
      // And adjust arrow's top offset accordingly so it always lines up with event
      if (top > maxTop) {
        arrowTopAdjust = top - maxTop
        top = maxTop
      } else {
        arrowTopAdjust = 0
      }

      setPopupStyle({ top, left, direction, visible: true, arrowTopAdjust })
    }, 10)
  }

  const handleFixtureMouseLeave = () => {
    setPopupStyle(prev => ({ ...prev, visible: false }))
    setPopupFixture(null)
  }

  // Popup rendered absolutely on top of calendar UI, beside the hovered event
  const renderFixturePopup = () => {
    if (!popupStyle.visible || !popupFixture) return null
    const fixture = popupFixture
    const teams = normalizeTeams(fixture.teams as FixtureTeamsInput, fixture as FixtureLike)
    const home = teams.home.name || 'Home'
    const away = teams.away.name || 'Away'
    const homeLogo = teams.home.logo
    const awayLogo = teams.away.logo

    // Fix: Arrow always points to the event by shifting its top offset
    const arrowTop =
      typeof popupStyle.arrowTopAdjust === 'number'
        ? 20 + popupStyle.arrowTopAdjust
        : 20

    const arrow =
      <div
        className="absolute will-change-transform"
        style={{
          top: arrowTop,
          [popupStyle.direction === 'right' ? 'left' : 'right']: -10,
          width: 0,
          height: 0,
          borderTop: '8px solid transparent',
          borderBottom: '8px solid transparent',
          [popupStyle.direction === 'right' ? 'borderRight' : 'borderLeft']: '8px solid #e5e7eb',
        }}
      />
    return (
      <div
        ref={popupRef}
        style={{
          position: 'absolute',
          top: popupStyle.top,
          left: popupStyle.left,
          zIndex: 1000,
          minWidth: 240,
          maxWidth: 320,
          boxShadow: '0 8px 32px 0 rgba(60,72,163,.10)',
          background: 'white',
          borderRadius: 13,
          border: '1px solid rgb(226 232 240)',
          padding: 11,
          pointerEvents: 'none',
        }}
        className={`calendar-fixture-popup transition-all duration-200 ease-[cubic-bezier(.4,0,.2,1)] select-none
          ${popupStyle.visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'}
        `}
        aria-live="polite"
      >
        {arrow}
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1">
            {homeLogo && (
              <img
                src={homeLogo}
                alt={home}
                className="h-5 w-5 rounded-full border border-white object-contain transition-all duration-200"
                style={{ transitionProperty: 'filter, transform', filter: 'drop-shadow(0 1px 2px rgba(60,72,163,0.09))' }}
              />
            )}
            {awayLogo && (
              <img
                src={awayLogo}
                alt={away}
                className="h-5 w-5 rounded-full border border-white object-contain transition-all duration-200"
                style={{ transitionProperty: 'filter, transform', filter: 'drop-shadow(0 1px 2px rgba(60,72,163,0.09))' }}
              />
            )}
            {!homeLogo && !awayLogo && (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[9px] font-semibold text-white transition-all">
                VS
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold text-slate-900">
              {home} vs {away}
            </div>
            <div className="truncate text-[10px] text-slate-500">
              {fixture.league?.name}
            </div>
          </div>
        </div>
        <div className="mt-1 flex flex-col gap-0.5 text-[10px] text-slate-500 transition-all">
          <span>
            {formatPrettyDate(fixture.date ?? null)} · {formatPrettyTime(fixture.date ?? null)}
          </span>
          {fixture.venue && <span>Venue: {fixture.venue}</span>}
          {fixture.status && <span>Status: {fixture.status}</span>}
        </div>
      </div>
    )
  }

  const renderDayCell = (date: Date) => {
    const key = date.toISOString().split('T')[0]
    const dayFixtures = fixturesByDate.get(key) ?? []
    const isCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear
    const isToday = key === today.toISOString().split('T')[0]
    const isExpanded = expandedDayKey === key
    const wasExpanded = animatedExpandedDayKey === key
    const VISIBLE_LIMIT = 3
    const showExpandBtn = !isExpanded && dayFixtures.length > VISIBLE_LIMIT
    const visibleFixtures = isExpanded ? dayFixtures : dayFixtures.slice(0, VISIBLE_LIMIT)
    const moreCount = !isExpanded && (dayFixtures.length - VISIBLE_LIMIT)

    return (
      <div
        key={key}
        className={`relative flex min-h-[96px] flex-col rounded-xl border bg-white/80 p-1.5 shadow-sm ${isCurrentMonth ? 'border-slate-200/80' : 'border-slate-100/80 opacity-60'}`}
        style={{
          transition: 'box-shadow 180ms, background 180ms',
          cursor: 'default'
        }}
      >
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
              isToday ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-50 text-slate-700'
            }`}
            style={{
              transition: 'background 200ms, color 200ms, box-shadow 200ms'
            }}
          >
            {date.getDate()}
          </span>
          {dayFixtures.length > 0 && (
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 transition-all duration-150">
              {dayFixtures.length} game{dayFixtures.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div
          className="mt-1 flex flex-1 flex-col gap-1 relative"
        >
          {visibleFixtures.map((fixture) => {
            const teams = normalizeTeams(fixture.teams as FixtureTeamsInput, fixture as FixtureLike)
            const home = teams.home.name || 'Home'
            const away = teams.away.name || 'Away'
            const homeLogo = teams.home.logo
            const awayLogo = teams.away.logo
            return (
              <button
                key={fixture.id}
                type="button"
                ref={ref => { eventBtnRefs.current[String(fixture.id)] = ref }}
                onClick={() => handleNavigateToInventory(fixture)}
                onMouseEnter={e => handleFixtureMouseEnter(fixture, e)}
                onMouseLeave={() => handleFixtureMouseLeave()}
                className="group relative flex w-full items-center gap-1.5 rounded-lg bg-sky-50/90 px-1.5 py-1 text-left text-[10px] text-sky-900 ring-offset-1 
                  transition-all duration-200 ease-in-out 
                  hover:bg-sky-200 hover:text-sky-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500
                  cursor-pointer shadow-sm active:scale-97"
                style={{
                  cursor: 'pointer',
                  transitionProperty: 'background, color, transform, box-shadow',
                  transform: `translateY(0) scale(1)`,
                }}
              >
                <div className="flex -space-x-1">
                  {homeLogo && (
                    <img
                      src={homeLogo}
                      alt={home}
                      className="h-4 w-4 rounded-full border border-white object-contain transition-all duration-150"
                      style={{ transitionProperty: 'filter', filter: 'drop-shadow(0 1px 2px rgba(60,72,163,0.09))' }}
                    />
                  )}
                  {awayLogo && (
                    <img
                      src={awayLogo}
                      alt={away}
                      className="h-4 w-4 rounded-full border border-white object-contain transition-all duration-150"
                      style={{ transitionProperty: 'filter', filter: 'drop-shadow(0 1px 2px rgba(60,72,163,0.09))' }}
                    />
                  )}
                  {!homeLogo && !awayLogo && (
                    <div
                      className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-[8px] font-semibold text-white transition-all"
                    >
                      VS
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">
                    {home} vs {away}
                  </span>
                  {fixture.league?.round && (
                    <span className="truncate text-[9px] text-sky-800/80">{fixture.league.round}</span>
                  )}
                </div>
              </button>
            )
          })}
          {/* Animated expand/collapse using opacity and maxHeight for slot */}
          {(wasExpanded || showExpandBtn) && (
            <div
              className={`transition-all duration-200 ease-in-out overflow-hidden`}
              style={{
                opacity: showExpandBtn ? 1 : 0,
                maxHeight: showExpandBtn ? 40 : 0,
                pointerEvents: showExpandBtn ? 'auto' : 'none',
                marginBottom: showExpandBtn ? 0 : -8
              }}
            >
              {showExpandBtn && moreCount && (
                <button
                  className="flex items-center text-[10px] font-medium text-sky-700 rounded-lg px-1 py-0.5 bg-white/60 hover:bg-sky-100 shadow transition-all duration-150 cursor-pointer"
                  onClick={() => setExpandedDayKey(key)}
                  style={{ cursor: 'pointer', transitionProperty: 'background, color, box-shadow, transform', }}
                >
                  <ChevronDown className="h-4 w-4 mr-1 transition-transform duration-200" />
                  Show {moreCount} more
                </button>
              )}
            </div>
          )}
          {/* Show less with enter/exit animation */}
          {(wasExpanded || isExpanded) && (
            <div
              className={`transition-all duration-200 ease-in-out overflow-hidden`}
              style={{
                opacity: isExpanded ? 1 : 0,
                maxHeight: isExpanded ? 40 : 0,
                pointerEvents: isExpanded ? 'auto' : 'none',
                marginTop: isExpanded ? 4 : -16,
              }}
            >
              {isExpanded && (
                <button
                  className="flex items-center text-[10px] font-medium text-slate-600 rounded-lg px-1 py-0.5 bg-slate-50 hover:bg-slate-100 shadow transition-all duration-150 mt-1 cursor-pointer"
                  onClick={() => setExpandedDayKey(null)}
                  style={{ cursor: 'pointer', transitionProperty: 'background, color, box-shadow, transform' }}
                >
                  <ChevronDown className="h-4 w-4 mr-1 rotate-180 transition-transform duration-200" />
                  Show less
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderPersonalDayCell = (date: Date) => {
    const key = date.toISOString().split('T')[0]
    const dayEvents = personalEventsByDate.get(key) ?? []
    const isCurrentMonth = date.getMonth() === currentMonth && date.getFullYear() === currentYear
    const isToday = key === today.toISOString().split('T')[0]

    return (
      <div
        key={key}
        className={`relative flex min-h-[96px] flex-col rounded-xl border bg-white/80 p-1.5 shadow-sm ${
          isCurrentMonth ? 'border-slate-200/80' : 'border-slate-100/80 opacity-60'
        }`}
        style={{
          transition: 'box-shadow 180ms, background 180ms',
          cursor: 'default'
        }}
      >
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <button
            type="button"
            onClick={() => openNewPersonalEvent(key)}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
              isToday ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-50 text-slate-700'
            }`}
            style={{ cursor: 'pointer' }}
          >
            {date.getDate()}
          </button>
          {dayEvents.length > 0 && (
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 transition-all duration-150">
              {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-1 flex-col gap-1 relative">
          {dayEvents.map(event => (
            <button
              key={event.id}
              type="button"
              onClick={() => openEditPersonalEvent(event)}
              className="group relative flex w-full items-center gap-1.5 rounded-lg bg-sky-50/90 px-1.5 py-1 text-left text-[10px] text-sky-900 ring-offset-1 
                transition-all duration-200 ease-in-out 
                hover:bg-sky-200 hover:text-sky-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500
                cursor-pointer shadow-sm active:scale-97"
              style={{
                cursor: 'pointer',
                transitionProperty: 'background, color, transform, box-shadow',
                transform: `translateY(0) scale(1)`
              }}
            >
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-[8px] font-semibold text-white">
                {event.start_time.substring(11, 16)}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{event.title}</span>
                {event.description && (
                  <span className="truncate text-[9px] text-sky-800/80">
                    {event.description}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Add the global event popup (absolutely on calendar container)
  const renderCalendarPopup = () => {
    return renderFixturePopup()
  }

  return (
    <DashboardLayout
      header={(
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>Match calendar</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Calendar</h1>
            <p className="mt-1 text-sm text-slate-500">
              Browse fixtures by league and jump straight into inventory when you find a game.
            </p>
          </div>
        </div>
      )}
    >
      <div className="calendar-outer-container flex flex-col gap-4 relative">
        {renderCalendarPopup()}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('matches')}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
                  activeTab === 'matches' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                Matches
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('personal')}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
                  activeTab === 'personal' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                Personal
              </button>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <span>{activeTab === 'matches' ? 'Filters' : 'Personal events'}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleMonthChange('prev')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-100
                  transition-transform duration-150 focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer active:scale-95"
                style={{ cursor: 'pointer', transitionProperty: 'background, color, box-shadow, transform'}}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-900">
                  {MONTH_NAMES[currentMonth]} {currentYear}
                </span>
                {activeTab === 'matches' && <span className="text-[11px] text-slate-400">{selectedLeague?.name ?? PREMIER_LEAGUE_NAME}</span>}
              </div>
              <button
                type="button"
                onClick={() => handleMonthChange('next')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-100
                  transition-transform duration-150 focus:outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer active:scale-95"
                style={{ cursor: 'pointer', transitionProperty: 'background, color, box-shadow, transform'}}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleToday}
                className="ml-1 inline-flex items-center rounded-full bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100
                  transition-all duration-150 active:scale-95 cursor-pointer"
                style={{ cursor: 'pointer', transitionProperty: 'background, color, transform' }}
              >
                Today
              </button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600">Year</label>
              <select
                className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors duration-150 cursor-pointer"
                value={currentYear}
                onChange={e => setCurrentYear(Number(e.target.value))}
                style={{ cursor: 'pointer' }}
              >
                {YEARS.map(year => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            {activeTab === 'matches' && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600">League</label>
                  <select
                    className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors duration-150 cursor-pointer"
                    value={selectedLeague?.id ?? selectedLeagueId}
                    onChange={e => setSelectedLeagueId(e.target.value)}
                    style={{ cursor: 'pointer' }}
                  >
                    {(leagues.length
                      ? leagues
                      : [{
                        id: PREMIER_LEAGUE_ID,
                        name: PREMIER_LEAGUE_NAME,
                        type: 'league',
                        logo: null,
                        country: 'England',
                        countryCode: 'GB',
                        season: currentYear,
                        seasons: [currentYear]
                      }]
                    ).map(league => (
                      <option key={league.id} value={league.id}>
                        {league.name ?? `League ${league.id}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600">Team</label>
                  <input
                    type="text"
                    className="h-8 w-44 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all duration-150"
                    placeholder="Search by team name"
                    value={selectedTeamName}
                    onChange={e => setSelectedTeamName(e.target.value)}
                    style={{ transitionProperty: 'background, color, border, box-shadow'}}
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {activeTab === 'matches' ? (
              <>
                <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                  <Users className="h-3 w-3" />
                  <span>Click a match to jump into inventory</span>
                </div>
                <div className="hidden items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500 sm:flex">
                  <MapPin className="h-3 w-3" />
                  <span>{selectedLeague?.name ?? PREMIER_LEAGUE_NAME}</span>
                </div>
              </>
            ) : (
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500">
                <Users className="h-3 w-3" />
                <span>Click a day or event to manage your personal calendar</span>
              </div>
            )}
          </div>
        </div>
        {activeTab === 'matches' && (loadingLeagues || loadingFixtures) && (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500 animate-pulse">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading fixtures…
          </div>
        )}
        {error && activeTab === 'matches' && !loadingFixtures && !loadingLeagues && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-3 text-sm text-rose-700 transition-all animate-fade-in">
            {error}
          </div>
        )}
        {activeTab === 'personal' && loadingPersonalEvents && (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500 animate-pulse">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading personal events…
          </div>
        )}
        {activeTab === 'personal' && !loadingPersonalEvents && !personalEvents.length && (
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 text-sm text-slate-500">
            No personal events yet. Click a day to add one.
          </div>
        )}
        {activeTab === 'matches' && !loadingLeagues && !loadingFixtures && !error && (
          <div
            className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ transition: 'background 180ms', cursor: 'default' }}
          >
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map(day => (
                <div
                  key={day}
                  className="px-1 pb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 transition-all duration-150"
                  style={{ cursor: 'default' }}
                >
                  {day}
                </div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {weeks.map(week => week.map(date => renderDayCell(date)))}
            </div>
          </div>
        )}
        {activeTab === 'personal' && !loadingPersonalEvents && (
          <div
            className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 shadow-sm"
            style={{ transition: 'background 180ms', cursor: 'default' }}
          >
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map(day => (
                <div
                  key={day}
                  className="px-1 pb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 transition-all duration-150"
                  style={{ cursor: 'default' }}
                >
                  {day}
                </div>
              ))}
            </div>
            <PersonalCalendarGrid
              weeks={weeks}
              currentMonth={currentMonth}
              currentYear={currentYear}
              today={today}
              personalEvents={personalEvents}
              onNewEvent={openNewPersonalEvent}
              onEditEvent={openEditPersonalEvent}
            />
          </div>
        )}

        <PersonalEventModal
          open={showEventModal}
          saving={savingEvent}
          editingEvent={editingEvent}
          errorMessage={personalFormError}
          formTitle={formTitle}
          formDescription={formDescription}
          formLocation={formLocation}
          formStartTime={formStartTime}
          formEndTime={formEndTime}
          formRepeat={formRepeat}
          formRepeatUntil={formRepeatUntil}
          formRemindMinutes={formRemindMinutes}
          onChangeTitle={setFormTitle}
          onChangeDescription={setFormDescription}
          onChangeLocation={setFormLocation}
          onChangeStartTime={setFormStartTime}
          onChangeEndTime={setFormEndTime}
          onChangeRepeat={setFormRepeat}
          onChangeRepeatUntil={setFormRepeatUntil}
          onChangeRemindMinutes={setFormRemindMinutes}
          onCancel={() => setShowEventModal(false)}
          onSave={handleSavePersonalEvent}
          onDelete={() => {
            if (editingEvent && (editingEvent.repeat !== 'none' || editingEvent.parent_event_id)) {
              setShowDeleteConfirm(true)
            } else {
              void handleDeletePersonalEvent(false)
            }
          }}
        />

        {showDeleteConfirm && editingEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
            <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                Delete event
              </h3>
              <p className="text-xs text-slate-600 mb-3">
                This event is part of a repeating series. Do you want to delete only this
                occurrence, or all occurrences in the series?
              </p>
              <div className="flex flex-col gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleDeletePersonalEvent(false)}
                  disabled={savingEvent}
                  className="h-8 rounded-full border border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-50 text-left cursor-pointer"
                >
                  Delete only this event
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePersonalEvent(true)}
                  disabled={savingEvent}
                  className="h-8 rounded-full border border-rose-200 bg-rose-50 px-3 text-xs font-medium text-rose-700 hover:bg-rose-100 text-left cursor-pointer"
                >
                  Delete all in series
                </button>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={savingEvent}
                  className="h-8 rounded-full border border-slate-200 px-3 text-xs text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

export default CalendarPage
