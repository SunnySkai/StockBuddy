import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useSession } from '../context/SessionContext';
import {
  fetchEventsCatalog,
  fetchFootballLeagueFixtures,
  fetchFootballLeagues,
  searchFootballFixtures,
} from '../api/events';
import type {
  EventCategory,
  EventOffering,
  FootballFixture,
  FootballFixtureSearchResult,
  FootballLeague,
  FootballFixtureTeam,
  FixtureSearchSuggestion,
} from '../types/events';
import { useEvents } from '../context/EventsContext';
import FixtureSearch from '../components/inventory/FixtureSearch';

type CategorySlug = 'sports' | 'live-entertainment';

const LEAGUE_CACHE = new Map<string, FootballLeague[]>();
const FIXTURE_CACHE = new Map<string, FootballFixture[]>();
const SEARCH_CACHE = new Map<string, FootballFixtureSearchResult[]>();
const SEARCH_SUGGESTIONS_CACHE = new Map<string, FootballFixtureSearchResult[]>();

const LEAGUES_PER_PAGE = 6;
const FIXTURES_PER_PAGE = 6;
const SEARCH_SUGGESTION_LIMIT = 6;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const NON_UPCOMING_STATUS_FLAGS = [
  'FT',
  'FULL',
  'FINISH',
  'ENDED',
  'CANCEL',
  'POST',
  'ABAN',
  'SUSP',
  'AWARD',
  'LIVE',
  '1H',
  '2H',
  'HT',
  'ET',
  'PEN',
  'INT',
  'BREAK',
] as const;

const isUpcomingStatusValue = (status: string | null | undefined): boolean => {
  if (!status) return true;
  const normalized = status.trim().toUpperCase();
  if (!normalized) return true;
  return !NON_UPCOMING_STATUS_FLAGS.some((flag) => normalized.includes(flag));
};

const isUpcomingFixtureLike = <T extends { status: string | null; date: string | null }>(
  fixture: T,
): boolean => {
  if (!fixture.date) return false;
  const timestamp = Date.parse(fixture.date);
  if (Number.isNaN(timestamp)) return false;
  if (timestamp <= Date.now()) return false;
  return isUpcomingStatusValue(fixture.status);
};

const sortByFixtureDate = <T extends { date: string | null }>(a: T, b: T) => {
  const aTime = a.date ? Date.parse(a.date) : Number.MAX_SAFE_INTEGER;
  const bTime = b.date ? Date.parse(b.date) : Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
};

const filterAndSortSearchResults = (results: FootballFixtureSearchResult[]) =>
  results.filter(isUpcomingFixtureLike).sort(sortByFixtureDate);

// Updated getTeamLabel to support both string and object team representations
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

const fixtureHasTitle = (
  fixture: FootballFixture | FootballFixtureSearchResult
): fixture is FootballFixtureSearchResult => {
  return 'title' in fixture && typeof fixture.title === 'string'
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

const mapFixtureLogos = <T extends FootballFixture | FootballFixtureSearchResult>(fixture: T): T => {
  const newTeams = normalizeTeams(fixture.teams, fixture as FixtureLike)
  return {
    ...fixture,
    teams: newTeams
  }
}

const buildInventoryFixtureSummary = (
  fixture: FootballFixture | FootballFixtureSearchResult
): InventoryFixtureSummary => {
  const teams = normalizeTeams(fixture.teams, fixture as FixtureLike)
  const home = getTeamLabel(teams.home) || teams.home.name || null
  const away = getTeamLabel(teams.away) || teams.away.name || null
  const fallbackTitle =
    home && away ? `${home} vs ${away}` : fixture.league?.name ?? `Fixture ${fixture.id}`
  const title = (fixtureHasTitle(fixture) ? fixture.title : undefined) ?? fallbackTitle
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

const useDebouncedValue = <T,>(value: T, delay: number) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
};

const formatDate = (isoDate: string | null) => {
  if (!isoDate) return 'Date TBC';
  const time = Date.parse(isoDate);
  if (Number.isNaN(time)) return 'Date TBC';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(time));
};

const formatTime = (isoDate: string | null) => {
  if (!isoDate) return 'Time TBC';
  const time = Date.parse(isoDate);
  if (Number.isNaN(time)) return 'Time TBC';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(time));
};

const EventsPage = () => {
  const navigate = useNavigate();
  const { status, token } = useSession();
  const { pinnedEvents, isPinned, pinFixture, unpinFixture } = useEvents();

  const [catalogCategories, setCatalogCategories] = useState<EventCategory[]>([]);
  const [catalogOfferings, setCatalogOfferings] = useState<EventOffering[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategorySlug>('sports');
  const [selectedOffering, setSelectedOffering] = useState<string | null>('football');
  const [leagues, setLeagues] = useState<FootballLeague[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState(false);
  const [leaguesError, setLeaguesError] = useState<string | null>(null);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null);
  const [selectedLeagueSeason, setSelectedLeagueSeason] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<FootballFixture[]>([]);
  const [fixturesLoading, setFixturesLoading] = useState(false);
  const [fixturesError, setFixturesError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<FootballFixtureSearchResult[] | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<FootballFixtureSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [fixtureDateFilter, setFixtureDateFilter] = useState('');
  const [fixtureSortDirection, setFixtureSortDirection] = useState<'asc' | 'desc'>('asc');
  const [quickSearchFixture, setQuickSearchFixture] = useState<FixtureSearchSuggestion | null>(null);
  const [leaguePage, setLeaguePage] = useState(1);
  const [leagueFixturePage, setLeagueFixturePage] = useState(1);
  const [searchFixturePage, setSearchFixturePage] = useState(1);
  const [hideSuggestions, setHideSuggestions] = useState(false);
  const [pendingPins, setPendingPins] = useState<Record<string, boolean>>({});
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const debouncedSearchTerm = useDebouncedValue(searchInput.trim(), 350);
  const currentYearStartIso = useMemo(() => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return start.toISOString().split('T')[0];
  }, []);

  const canFetch = status === 'authenticated' && Boolean(token);
  const fixturesControllerRef = useRef<AbortController | null>(null);
  const suggestionControllerRef = useRef<AbortController | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(leagues.length / LEAGUES_PER_PAGE) || 1);
    setLeaguePage((prev) => (prev > totalPages ? totalPages : prev));
  }, [leagues.length]);

  useEffect(() => {
    setLeagueFixturePage((prev) =>
      Math.min(prev, Math.max(1, Math.ceil(fixtures.length / FIXTURES_PER_PAGE) || 1)),
    );
  }, [fixtures.length]);

  useEffect(() => {
    if (!searchResults) {
      setSearchFixturePage(1);
      return;
    }
    setSearchFixturePage((prev) =>
      Math.min(
        prev,
        Math.max(1, Math.ceil(searchResults.length / FIXTURES_PER_PAGE) || 1),
      ),
    );
  }, [searchResults]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    setLeagueFixturePage(1);
  }, [selectedLeagueId, selectedLeagueSeason]);

  useEffect(() => {
    if (!canFetch) return;
    let isCancelled = false;

    const loadCatalog = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      const result = await fetchEventsCatalog(token!);
      if (isCancelled) return;
      if (!result.ok) {
        setCatalogError(result.error);
        setCatalogLoading(false);
        return;
      }
      const { categories, sports } = result.data.data;
      setCatalogCategories(categories);
      setCatalogOfferings(sports);
      setCatalogLoading(false);
      const firstAvailable = sports.find((item) => item.status === 'available');
      setSelectedOffering(firstAvailable ? firstAvailable.slug : null);
    };

    loadCatalog();

    return () => {
      isCancelled = true;
    };
  }, [canFetch, token]);

  useEffect(() => {
    if (!canFetch || selectedOffering !== 'football') return;
    let isCancelled = false;
    const loadLeagues = async () => {
      setLeaguesLoading(true);
      setLeaguesError(null);
      const targetSeason = 2025;
      const cacheKey = JSON.stringify({ season: targetSeason, country: '' });
      const cached = LEAGUE_CACHE.get(cacheKey);
      if (cached) {
        applyLeaguesData(cached);
        setLeaguesLoading(false);
        return;
      }
      const result = await fetchFootballLeagues(token!, { season: targetSeason });
      if (isCancelled) return;
      if (!result.ok) {
        setLeaguesError(result.error);
        setLeaguesLoading(false);
        return;
      }
      const data = result.data.data;
      LEAGUE_CACHE.set(cacheKey, data);
      applyLeaguesData(data);
      setLeaguesLoading(false);
    };

    const applyLeaguesData = (data: FootballLeague[]) => {
      const premiumOrder = [
        { pattern: /^premier league$/i, country: 'england' },
        { pattern: /^la liga$/i, country: 'spain' },
        { pattern: /^bundesliga$/i, country: 'germany' },
        { pattern: /^serie a$/i, country: 'italy' },
        { pattern: /^ligue 1$/i, country: 'france' },
        { pattern: /^saudi pro league$/i, country: 'saudi arabia' }
      ];
      const scoreLeague = (league: FootballLeague) => {
        const name = (league.name ?? '').toLowerCase().trim();
        const country = (league.country ?? '').toLowerCase().trim();

        // Penalize lower tiers explicitly
        if (name.includes('non league') || name.includes('national league')) {
          return 100;
        }

        const idx = premiumOrder.findIndex(
          ({ pattern, country: c }) => pattern.test(name) && (!c || country === c),
        );
        if (idx >= 0) return idx;

        // Give a slight bump to top-country leagues that include "premier" but are not non-league
        if (country === 'england' && name.includes('premier')) return premiumOrder.length + 1;

        return premiumOrder.length + 10;
      };

      const sorted = [...data].sort((a, b) => {
        const sa = scoreLeague(a);
        const sb = scoreLeague(b);
        if (sa !== sb) return sa - sb;
        return (a.name ?? '').localeCompare(b.name ?? '');
      });

      setLeagues(sorted);
      if (sorted.length > 0) {
        setSelectedLeagueId((prev) => prev ?? sorted[0].id);
        const defaultSeason =
          sorted[0].season ??
          (Array.isArray(sorted[0].seasons) ? sorted[0].seasons[0] : null);
        setSelectedLeagueSeason((prev) =>
          prev ?? (defaultSeason ? String(defaultSeason) : null),
        );
      }
    };

    loadLeagues();

    return () => {
      isCancelled = true;
    };
  }, [canFetch, selectedOffering, token]);

  // Helper for manually loading league fixtures by league id/season (when from suggestion).
  const setUpcomingFixtures = useCallback((cached: FootballFixture[]) => {
    const upcoming = cached;
    setFixtures(upcoming);
    setFixturesLoading(false);
    setFixturesError(null);
  }, []);

  const fetchAndSetFixtures = useCallback(
    async (
      cacheKey: string,
      leagueId?: string,
      leagueSeason?: string | null,
    ) => {
      fixturesControllerRef.current?.abort();
      const controller = new AbortController();
      fixturesControllerRef.current = controller;
      setFixturesLoading(true);
      setFixturesError(null);

      const useLeagueId = leagueId ?? (selectedLeagueId ?? undefined);
      const useSeason =
        leagueSeason !== undefined ? leagueSeason : selectedLeagueSeason ?? undefined;

      const result = await fetchFootballLeagueFixtures(
        token!,
        useLeagueId!,
        { season: useSeason || undefined },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setFixturesError(result.error);
        setFixturesLoading(false);
        return;
      }
      const data = result.data.data;
      const upcoming = data;
      const withLogos = upcoming.map(mapFixtureLogos);
      FIXTURE_CACHE.set(cacheKey, withLogos);
      setFixtures(withLogos);
      setFixturesLoading(false);
    },
    [selectedLeagueId, selectedLeagueSeason, token],
  );

  useEffect(() => {
    if (!canFetch || !selectedLeagueId) return;
    const seasonKey = selectedLeagueSeason ?? 'current';
    const cacheKey = `${selectedLeagueId}|${seasonKey}`;
    const cached = FIXTURE_CACHE.get(cacheKey);
    if (cached) {
      setUpcomingFixtures(cached);
      return;
    }
    fetchAndSetFixtures(cacheKey);
  }, [
    canFetch,
    fetchAndSetFixtures,
    selectedLeagueId,
    selectedLeagueSeason,
    setUpcomingFixtures,
  ]);

  const fetchAndSetSearchResults = useCallback(
    async (cacheKey: string, query: string) => {
      searchControllerRef.current?.abort();
      const controller = new AbortController();
      searchControllerRef.current = controller;

      setSearchLoading(true);
      setSearchError(null);
      const result = await searchFootballFixtures(
        token!,
        query,
        {},
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (!result.ok) {
        setSearchError(result.error);
        setSearchLoading(false);
        return;
      }
      const filtered = filterAndSortSearchResults(result.data.data).map(mapFixtureLogos);
      SEARCH_CACHE.set(cacheKey, filtered);
      setSearchResults(filtered);
      setSearchLoading(false);
    },
    [token],
  );

  const fetchAndSetSearchSuggestions = useCallback(
    async (cacheKey: string, query: string) => {
      suggestionControllerRef.current?.abort();
      const controller = new AbortController();
      suggestionControllerRef.current = controller;

      const result = await searchFootballFixtures(
        token!,
        query,
        {},
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (!result.ok) {
        return;
      }
      const filtered = filterAndSortSearchResults(result.data.data).map(mapFixtureLogos);
      SEARCH_SUGGESTIONS_CACHE.set(cacheKey, filtered);
      setSearchSuggestions(filtered);
    },
    [token],
  );

  const clearSearchResults = useCallback(() => {
    searchControllerRef.current?.abort();
    suggestionControllerRef.current?.abort();
    setSearchResults(null);
    setSearchError(null);
    setSearchLoading(false);
    setSearchSuggestions([]);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setActiveSearchTerm('');
    setSearchFixturePage(1);
    setHideSuggestions(false);
    setSearchSuggestions([]);
    clearSearchResults();
  }, [clearSearchResults]);

  const handleFixtureDateFilterChange = useCallback(
    (value: string) => {
      setFixtureDateFilter(value || '');
    },
    [],
  );

  const clearFixtureDateFilter = useCallback(() => {
    setFixtureDateFilter('');
  }, []);

  const toggleFixtureSortDirection = useCallback(() => {
    setFixtureSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  }, []);

  // NO effect-driven search, ONLY manual submit
  const handleSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canFetch) return;
      const trimmed = searchInput.trim();
      setSearchError(null);
      if (!trimmed.length) {
        clearSearch();
        return;
      }
      setSearchInput(trimmed);
      setActiveSearchTerm(trimmed);
      setSearchFixturePage(1);
      setHideSuggestions(true);
      setSearchSuggestions([]);
      suggestionControllerRef.current?.abort();
      const cacheKey = `${trimmed.toLowerCase()}|all`;
      const cached = SEARCH_CACHE.get(cacheKey);
      if (cached) {
        setSearchResults(filterAndSortSearchResults(cached));
        setSearchLoading(false);
        setSearchError(null);
        return;
      }
      fetchAndSetSearchResults(cacheKey, trimmed);
    },
    [canFetch, searchInput, clearSearch, fetchAndSetSearchResults],
  );

  useEffect(() => {
    if (!canFetch) return;
    if (!debouncedSearchTerm) {
      suggestionControllerRef.current?.abort();
      setSearchSuggestions([]);
      return;
    }
    if (debouncedSearchTerm.length < 2) {
      setSearchSuggestions([]);
      return;
    }
    const cacheKey = `${debouncedSearchTerm.toLowerCase()}|all`;
    const cached = SEARCH_SUGGESTIONS_CACHE.get(cacheKey);
    if (cached) {
      setSearchSuggestions(cached);
      return;
    }
    fetchAndSetSearchSuggestions(cacheKey, debouncedSearchTerm);
  }, [canFetch, debouncedSearchTerm, fetchAndSetSearchSuggestions]);

  useEffect(() => {
    return () => {
      fixturesControllerRef.current?.abort();
      searchControllerRef.current?.abort();
      suggestionControllerRef.current?.abort();
    };
  }, []);

  const handlePinToggle = async (fixtureId: string, shouldPin: boolean) => {
    if (pendingPins[fixtureId]) return;
    setPendingPins((prev) => ({ ...prev, [fixtureId]: true }));
    const result = shouldPin
      ? await pinFixture(fixtureId)
      : await unpinFixture(fixtureId);
    setPendingPins((prev) => {
      const next = { ...prev };
      delete next[fixtureId];
      return next;
    });
    if (!result.ok) {
      setActionMessage({ type: 'error', text: result.error });
      return;
    }
    setActionMessage({
      type: 'success',
      text: shouldPin ? 'Event pinned to your dashboard.' : 'Event removed from My Events.',
    });
  };

  const handleNavigateToInventory = useCallback(
    (fixture: FootballFixture | FootballFixtureSearchResult) => {
      const summary = buildInventoryFixtureSummary(fixture);
      navigate(`/inventory?game_id=${summary.id}`, { state: { fixture: summary } });
    },
    [navigate],
  );

  const handleQuickFixtureSearchSelect = useCallback(
    (fixture: FixtureSearchSuggestion) => {
      setQuickSearchFixture(fixture);
      const summary: InventoryFixtureSummary = {
        id: fixture.id,
        title: `${fixture.home_team} vs ${fixture.away_team}`,
        date: fixture.date,
        homeTeam: fixture.home_team,
        awayTeam: fixture.away_team,
        homeLogo: fixture.home_logo ?? null,
        awayLogo: fixture.away_logo ?? null,
      };
      navigate(`/inventory?game_id=${fixture.id}`, { state: { fixture: summary } });
    },
    [navigate],
  );

  const selectedLeague = useMemo(
    () => leagues.find((league) => league.id === selectedLeagueId) ?? null,
    [leagues, selectedLeagueId],
  );

  const totalLeaguePages = Math.max(1, Math.ceil(leagues.length / LEAGUES_PER_PAGE) || 1);
  const currentLeaguePage = Math.min(leaguePage, totalLeaguePages);

  const paginatedLeagues = useMemo(() => {
    if (leagues.length === 0) return [];
    const start = (currentLeaguePage - 1) * LEAGUES_PER_PAGE;
    return leagues.slice(start, start + LEAGUES_PER_PAGE);
  }, [currentLeaguePage, leagues]);

  const baseFixtures = searchResults ?? fixtures;

  const filteredFixtures = useMemo(() => {
    if (!fixtureDateFilter) {
      return baseFixtures;
    }
    const threshold = Date.parse(fixtureDateFilter);
    if (Number.isNaN(threshold)) {
      return baseFixtures;
    }
    return baseFixtures.filter((fixture) => {
      if (!fixture.date) return false;
      const fixtureTime = Date.parse(fixture.date);
      return !Number.isNaN(fixtureTime) && fixtureTime >= threshold;
    });
  }, [baseFixtures, fixtureDateFilter]);

  const activeFixtures = useMemo(() => {
    if (filteredFixtures.length <= 1) {
      return filteredFixtures;
    }
    const sorted = [...filteredFixtures];
    sorted.sort((a, b) =>
      fixtureSortDirection === 'asc' ? sortByFixtureDate(a, b) : sortByFixtureDate(b, a),
    );
    return sorted;
  }, [filteredFixtures, fixtureSortDirection]);
  const activeFixturePage = searchResults ? searchFixturePage : leagueFixturePage;
  const totalFixturePages = Math.max(
    1,
    Math.ceil(activeFixtures.length / FIXTURES_PER_PAGE) || 1,
  );
  const currentFixturePage = Math.min(activeFixturePage, totalFixturePages);

  const fixturesToDisplay = useMemo(() => {
    if (activeFixtures.length === 0) return [];
    const start = (currentFixturePage - 1) * FIXTURES_PER_PAGE;
    return activeFixtures.slice(start, start + FIXTURES_PER_PAGE);
  }, [activeFixtures, currentFixturePage]);

  const fixtureStartIndex =
    activeFixtures.length === 0 ? 0 : (currentFixturePage - 1) * FIXTURES_PER_PAGE + 1;
  const fixtureEndIndex = Math.min(currentFixturePage * FIXTURES_PER_PAGE, activeFixtures.length);
  const showFixtureFilters = baseFixtures.length > 0 || Boolean(fixtureDateFilter);
  const hasSearchQuery = searchInput.trim().length > 0 || Boolean(activeSearchTerm);
  const normalizedSearchInput = searchInput.trim().toLowerCase();

  const fixtureSuggestions = useMemo(() => {
    if (normalizedSearchInput.length < 2) return [];
    return searchSuggestions
      .filter((fixture) => {
        // Use normalized teams
        const teams = normalizeTeams(fixture.teams);
        const fallbackTitle =
          `${getTeamLabel(teams.home)} vs ${getTeamLabel(teams.away)}`.trim();
        const title = (
          fixtureHasTitle(fixture) ? fixture.title : fallbackTitle
        ).toLowerCase();
        return title.includes(normalizedSearchInput);
      })
      .slice(0, SEARCH_SUGGESTION_LIMIT);
  }, [normalizedSearchInput, searchSuggestions]);

  const leagueSuggestions = useMemo(() => {
    if (normalizedSearchInput.length < 2) return [];
      return leagues
        .filter((league) => {
          const name = (league.name ?? '').toLowerCase();
          const country = (league.country ?? '').toLowerCase();
          return name.includes(normalizedSearchInput) || country.includes(normalizedSearchInput);
        })
        .slice(0, SEARCH_SUGGESTION_LIMIT);
  }, [leagues, normalizedSearchInput]);

  const showSuggestionPanel =
    normalizedSearchInput.length >= 2 &&
    !hideSuggestions &&
    (fixtureSuggestions.length > 0 || leagueSuggestions.length > 0);

  const goToPreviousLeaguePage = useCallback(() => {
    setLeaguePage((prev) => clamp(prev - 1, 1, totalLeaguePages));
  }, [totalLeaguePages]);

  const goToNextLeaguePage = useCallback(() => {
    setLeaguePage((prev) => clamp(prev + 1, 1, totalLeaguePages));
  }, [totalLeaguePages]);

  const goToPreviousFixturePage = useCallback(() => {
    if (searchResults) {
      setSearchFixturePage((prev) => clamp(prev - 1, 1, totalFixturePages));
    } else {
      setLeagueFixturePage((prev) => clamp(prev - 1, 1, totalFixturePages));
    }
  }, [searchResults, totalFixturePages]);

  const goToNextFixturePage = useCallback(() => {
    if (searchResults) {
      setSearchFixturePage((prev) => clamp(prev + 1, 1, totalFixturePages));
    } else {
      setLeagueFixturePage((prev) => clamp(prev + 1, 1, totalFixturePages));
    }
  }, [searchResults, totalFixturePages]);

  const handleFixtureSuggestionSelect = useCallback(
    (fixture: FootballFixtureSearchResult) => {
      const teams = normalizeTeams(fixture.teams);
      const fallbackTitle = `${getTeamLabel(teams.home)} vs ${getTeamLabel(teams.away)}`.trim();
      const label = (fixtureHasTitle(fixture) ? fixture.title : fallbackTitle) || fallbackTitle;
      setSearchInput(label);
      setActiveSearchTerm(label);
      setSearchError(null);
      setSearchFixturePage(1);
      setHideSuggestions(true);
      setSearchSuggestions([]);
      suggestionControllerRef.current?.abort();
      setSearchResults((prev) => {
        if (!prev) return [fixture];
        if (prev.some((item) => item.id === fixture.id)) {
          return prev;
        }
        return [fixture, ...prev];
      });
      const cacheKey = `${label.toLowerCase()}|all`;
      const cached = SEARCH_CACHE.get(cacheKey);
      if (cached) {
        setSearchResults(filterAndSortSearchResults(cached));
        setSearchLoading(false);
        setSearchError(null);
        return;
      }
      fetchAndSetSearchResults(cacheKey, label);
    },
    [fetchAndSetSearchResults],
  );

  // <-- FIX: League selection from suggestion directly loads fixtures
  const handleLeagueSuggestionSelect = useCallback(
    (league: FootballLeague) => {
      setSelectedLeagueId(league.id);
      const defaultSeason =
        league.season ??
        (Array.isArray(league.seasons) ? league.seasons[0] : null);
      setSelectedLeagueSeason(
        defaultSeason ? String(defaultSeason) : null,
      );
      const leagueIndex = leagues.findIndex((item) => item.id === league.id);
      if (leagueIndex >= 0) {
        const targetPage = Math.floor(leagueIndex / LEAGUES_PER_PAGE) + 1;
        setLeaguePage(targetPage);
      }
      setSearchInput('');
      setActiveSearchTerm('');
      setHideSuggestions(true);
      setSearchSuggestions([]);
      suggestionControllerRef.current?.abort();
      clearSearchResults();

      // crucial: immediately show fixtures for newly selected league:
      const seasonKey = defaultSeason ? String(defaultSeason) : 'current';
      const cacheKey = `${league.id}|${seasonKey}`;
      const cached = FIXTURE_CACHE.get(cacheKey);
      if (cached) {
        setUpcomingFixtures(cached);
        setFixturesLoading(false);
        setFixturesError(null);
      } else {
        setFixtures([]);
        setFixturesLoading(true);
        setFixturesError(null);
        fetchAndSetFixtures(cacheKey, league.id, defaultSeason ? String(defaultSeason) : null);
      }
    },
    [clearSearchResults, leagues, setUpcomingFixtures, fetchAndSetFixtures],
  );

  const fixturesContent = fixturesLoading ? (
    <div className="flex items-center justify-center gap-3 rounded-[24px] border border-white/70 bg-white py-16 text-slate-500">
      <Loader2 className="h-6 w-6 animate-spin text-[#1d4ed8]" />
      <span className="text-sm font-semibold">Loading fixtures...</span>
    </div>
  ) : fixturesError ? (
    <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-6 py-8 text-center text-sm text-rose-600">
      <p className="font-semibold">Unable to load fixtures</p>
      <p className="mt-1">{fixturesError}</p>
    </div>
  ) : fixturesToDisplay.length === 0 ? (
    <div className="rounded-[24px] border border-dashed border-[#cbd6ff] bg-[#eef2ff] px-6 py-10 text-center text-sm text-slate-500">
      <p className="text-base font-semibold text-slate-700">
        {activeSearchTerm
          ? 'No fixtures match your search.'
          : selectedLeagueId
          ? 'No fixtures available for this league.'
          : 'Fixtures will appear here once fetched.'}
      </p>
      {activeSearchTerm && (
        <button
          type="button"
          onClick={clearSearch}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#cbd6ff] bg-white px-4 py-2 text-xs font-semibold text-[#1d4ed8] hover:border-[#1d4ed8]"
        >
          <ArrowLeft className="h-4 w-4" />
          Clear search
        </button>
      )}
      {!activeSearchTerm && (
        <p className="mt-2">Select a league to populate this view.</p>
      )}
    </div>
  ) : (
    <div className="space-y-5">
      {searchResults && activeSearchTerm && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#cbd6ff] bg-white px-5 py-4 text-sm text-slate-600">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8aa0ff]">
              Search results
            </p>
            <p className="mt-1 text-sm">
              Showing {fixtureStartIndex}&ndash;{fixtureEndIndex} of {activeFixtures.length}{' '}
              fixture{activeFixtures.length === 1 ? '' : 's'} for{' '}
              <span className="font-semibold text-slate-700">
                "{activeSearchTerm.trim()}"
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={clearSearch}
            className="inline-flex items-center gap-2 rounded-full border border-[#cbd6ff] bg-white px-4 py-2 text-xs font-semibold text-[#1d4ed8] hover:border-[#1d4ed8]"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to league view
          </button>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {fixturesToDisplay.map((fixture) => {
          // Always normalize teams for display
          const teams = normalizeTeams(fixture.teams);
          const fixtureTitle = fixtureHasTitle(fixture) ? fixture.title : null;
          return (
            <div
              key={fixture.id}
              className="flex flex-col justify-between rounded-[24px] border border-white/70 bg-white px-6 py-5 shadow-sm"
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      {fixture.league.name ?? 'League'}
                    </p>
                    {fixtureTitle ? (
                      <h3 className="mt-3 text-lg font-semibold text-slate-900">
                        {fixtureTitle}
                      </h3>
                    ) : (
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex flex-1 items-center gap-2 min-w-0">
                          {teams.home.logo && (
                            <img
                              src={teams.home.logo}
                              alt={getTeamLabel(teams.home) || 'Home team'}
                              className="h-8 w-8 flex-shrink-0 rounded-full border border-slate-200 bg-white object-contain p-0.5"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          <span className="text-base font-semibold text-slate-900 truncate">
                            {getTeamLabel(teams.home) || 'TBC'}
                          </span>
                        </div>
                        <span className="flex-shrink-0 text-sm font-semibold text-slate-400">
                          vs
                        </span>
                        <div className="flex flex-1 items-center gap-2 justify-end min-w-0">
                          <span className="text-base font-semibold text-slate-900 truncate text-right">
                            {getTeamLabel(teams.away) || 'TBC'}
                          </span>
                          {teams.away.logo && (
                            <img
                              src={teams.away.logo}
                              alt={getTeamLabel(teams.away) || 'Away team'}
                              className="h-8 w-8 flex-shrink-0 rounded-full border border-slate-200 bg-white object-contain p-0.5"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {fixture.status && (
                    <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 whitespace-nowrap">
                      {fixture.status ?? 'Scheduled'}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                    <CalendarDays className="h-4 w-4" />
                    {formatDate(fixture.date)}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1">
                    {formatTime(fixture.date)}
                  </span>
                  {fixture.venue && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1">
                      <MapPin className="h-4 w-4 text-[#1d4ed8]" />
                      {fixture.venue ?? 'Venue TBC'}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  {fixture.league.country ?? 'International'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleNavigateToInventory(fixture)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#cbd6ff] hover:text-[#1d4ed8]"
                  >
                    Manage inventory
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePinToggle(fixture.id, !isPinned(fixture.id))}
                    disabled={pendingPins[fixture.id]}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
                      isPinned(fixture.id)
                        ? 'bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white shadow hover:shadow-lg'
                        : 'border border-slate-200 text-slate-600 hover:border-[#cbd6ff] hover:text-[#1d4ed8]'
                    } ${pendingPins[fixture.id] ? 'opacity-70' : ''}`}
                  >
                    {pendingPins[fixture.id] ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : isPinned(fixture.id) ? (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Pinned
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        Pin to My Events
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {totalFixturePages > 1 && (
        <div className="flex items-center justify-between rounded-[20px] border border-[#cbd6ff] bg-white px-4 py-2 text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={goToPreviousFixturePage}
            disabled={currentFixturePage === 1}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 transition ${
              currentFixturePage === 1
                ? 'cursor-not-allowed border-slate-200 text-slate-300'
                : 'border-[#cbd6ff] text-[#1d4ed8] hover:border-[#1d4ed8]'
            }`}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </button>
          <span>
            Showing {fixtureStartIndex}&ndash;{fixtureEndIndex} of {activeFixtures.length}
          </span>
          <button
            type="button"
            onClick={goToNextFixturePage}
            disabled={currentFixturePage === totalFixturePages}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 transition ${
              currentFixturePage === totalFixturePages
                ? 'cursor-not-allowed border-slate-200 text-slate-300'
                : 'border-[#cbd6ff] text-[#1d4ed8] hover:border-[#1d4ed8]'
            }`}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  const renderOfferingStatus = (offering: EventOffering) =>
    offering.status === 'available' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
        <ShieldCheck className="h-3.5 w-3.5" />
        Live
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
        <Sparkles className="h-3.5 w-3.5" />
        Coming soon
      </span>
    );

  const header = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm font-semibold uppercase tracking-[0.4em] text-[#8aa0ff]">
        <CalendarDays className="h-4 w-4 text-[#1d4ed8]" />
        Events Control Room
      </div>
      <div>
        <h1 className="text-4xl font-semibold text-slate-900">Curate the moments that matter.</h1>
        <p className="mt-3 max-w-2xl text-base text-slate-500">
          Explore leagues, and pin the matches your operators need to watch. Anything pinned appears in{' '}
          <span className="font-semibold text-slate-700">My Events</span> on the dashboard.
        </p>
      </div>
      {actionMessage && (
        <div
          className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
              : 'bg-rose-50 text-rose-600 border border-rose-100'
          }`}
        >
          {actionMessage.type === 'success' ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {actionMessage.text}
        </div>
      )}
    </div>
  );

  if (!canFetch) {
    return (
      <DashboardLayout header={header}>
        <div className="rounded-3xl border border-dashed border-[#cbd6ff] bg-white/60 p-10 text-center text-slate-500 shadow-inner">
          <p className="text-lg font-semibold text-slate-700">We're preparing your workspace.</p>
          <p className="mt-2 text-sm">
            Authenticate to unlock the events catalog and start pinning fixtures for your team.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const categoryCards = catalogCategories.map((category) => (
    <button
      key={category.slug}
      type="button"
      onClick={() => setActiveCategory(category.slug as CategorySlug)}
      className={`flex flex-1 flex-col gap-3 rounded-[28px] border px-6 py-6 text-left shadow-sm transition ${
        activeCategory === category.slug
          ? 'border-[#1d4ed8] bg-gradient-to-br from-[#eef3ff] via-white to-[#f5f7ff] shadow-lg'
          : 'border-white/70 bg-white hover:border-[#cbd6ff]'
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-slate-900">{category.name}</h3>
        <ChevronRight className="h-5 w-5 text-slate-400" />
      </div>
      <p className="text-sm text-slate-500">{category.description}</p>
    </button>
  ));

  const sportsOfferings = catalogOfferings.map((offering) => {
    const isActive = selectedOffering === offering.slug;
    const isDisabled = offering.status !== 'available';
    return (
      <button
        key={offering.slug}
        type="button"
        onClick={() => !isDisabled && setSelectedOffering(offering.slug)}
        className={`flex flex-col gap-4 rounded-[24px] border px-5 py-5 text-left transition ${
          isActive
            ? 'border-[#1d4ed8] bg-gradient-to-br from-[#eef3ff] via-white to-[#f5f7ff] shadow-lg'
            : 'border-white/70 bg-white hover:border-[#cbd6ff]'
        } ${isDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{offering.slug}</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-900">{offering.name}</h4>
            <p className="mt-2 text-sm text-slate-500">{offering.description}</p>
          </div>
          <div>{renderOfferingStatus(offering)}</div>
        </div>
        <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-[#1d4ed8]">
          <span>{isActive ? 'Viewing' : isDisabled ? 'Coming soon' : 'Preview feed'}</span>
          {!isDisabled && <ArrowRight className={`h-3.5 w-3.5 ${isActive ? 'text-white/70' : ''}`} />}
        </div>
      </button>
    );
  });

  const leagueCards = paginatedLeagues.map((league) => {
    const isActive = selectedLeagueId === league.id;
    const seasons = league.seasons ?? [];
    return (
      <div
        key={league.id}
        className={`flex flex-col gap-3 rounded-[20px] border px-5 py-4 transition ${
          isActive
            ? 'border-[#1d4ed8] bg-white shadow-lg'
            : 'border-white/70 bg-white/70 hover:border-[#cbd6ff]'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
              {league.country ?? 'Global'}
            </p>
            <h5 className="mt-1 text-base font-semibold text-slate-900">{league.name}</h5>
            {league.type && <p className="text-xs text-slate-500">{league.type}</p>}
          </div>
          {league.logo && (
            <img
              src={league.logo}
              alt={`${league.name} logo`}
              className="h-10 w-10 rounded-full border border-slate-200 bg-white object-contain p-1"
              loading="lazy"
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1">
            <Trophy className="h-3.5 w-3.5 text-[#1d4ed8]" />
            Season {league.season ?? seasons[0]}
          </span>
          {isActive && seasons.length > 0 && (
            <select
              value={selectedLeagueSeason ?? ''}
              onChange={(event) => setSelectedLeagueSeason(event.target.value || null)}
              className="rounded-full border border-[#cbd6ff] bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm focus:border-[#1d4ed8] focus:outline-none"
            >
              {seasons.map((season) => (
                <option key={String(season)} value={String(season)}>
                  {season}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectedLeagueId(league.id);
            const defaultSeason =
              league.season ??
              (Array.isArray(league.seasons) ? league.seasons[0] : null);
            setSelectedLeagueSeason((prev) =>
              league.id === selectedLeagueId
                ? prev
                : defaultSeason
                ? String(defaultSeason)
                : null,
            );
          }}
          className={`inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs font-semibold transition ${
            isActive
              ? 'bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white shadow'
              : 'border border-slate-200 text-slate-500 hover:border-[#cbd6ff] hover:text-[#1d4ed8]'
          }`}
        >
          View fixtures
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  });

  return (
    <DashboardLayout header={header}>
      <div className="space-y-10">
        <section className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_32px_70px_rgba(79,70,229,0.08)]">
          <div className="flex flex-col gap-6 lg:flex-row">
            {catalogLoading ? (
              <div className="flex flex-1 items-center justify-center gap-3 rounded-[24px] border border-white/70 bg-white/60 py-10 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin text-[#1d4ed8]" />
                Loading categories...
              </div>
            ) : catalogError ? (
              <div className="flex flex-1 items-center gap-3 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-6 text-sm text-rose-600">
                <AlertCircle className="h-5 w-5" />
                <span>{catalogError}</span>
              </div>
            ) : (
              <>
                <div className="flex flex-1 flex-col gap-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Discover categories
                  </p>
                  <div className="flex flex-col gap-3 md:flex-row">{categoryCards}</div>
                </div>
                {activeCategory === 'sports' && (
                  <div className="flex flex-1 flex-col gap-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Available sports feeds
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">{sportsOfferings}</div>
                  </div>
                )}
                {activeCategory === 'live-entertainment' && (
                  <div className="flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-[#cbd6ff] bg-[#eef2ff] px-6 py-10 text-center text-sm text-slate-500">
                    Concerts, festivals, and cultural events are on the roadmap. Stay tuned for announcements.
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {selectedOffering === 'football' && (
          <>
            <section className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_32px_70px_rgba(15,23,42,0.1)]">
              <form onSubmit={handleSearch} className="flex flex-col gap-4 md:flex-row md:items-end">
                <div className="cursor-pointer flex-1">
                  <label htmlFor="events-search" className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Search Leagues
                  </label>
                  <div className="mt-2 relative">
                    <div className="flex items-center gap-3 rounded-[20px] border border-[#cbd6ff] bg-white px-4 py-3 shadow-sm focus-within:border-[#1d4ed8]">
                      <Search className="h-5 w-5 text-[#1d4ed8]" />
                      <input
                        id="events-search"
                        name="events-search"
                        type="text"
                        value={searchInput}
                        onChange={(event) => {
                          setSearchInput(event.target.value);
                          setSearchError(null);
                          setHideSuggestions(false);
                        }}
                        placeholder='Try "England Premier League"'
                        className="flex-1 border-none text-sm text-slate-700 outline-none"
                        autoComplete="off"
                      />
                    </div>
                    {showSuggestionPanel && (
                      <div className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-[22px] border border-[#cbd6ff] bg-white shadow-xl">
                        {leagueSuggestions.length > 0 && (
                          <div>
                            <div className="border-b border-[#eef2ff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#8aa0ff]">
                              Leagues
                            </div>
                            <div className="divide-y divide-[#eef2ff]">
                              {leagueSuggestions.map((league) => (
                                <button
                                  key={league.id}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    handleLeagueSuggestionSelect(league);
                                    }}
                                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-slate-600 transition hover:bg-[#eef2ff]"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      {league.logo ? (
                                        <img
                                          src={league.logo}
                                          alt={`${league.name ?? 'League'} logo`}
                                          className="h-8 w-8 flex-shrink-0 rounded-full border border-slate-200 bg-white object-contain p-1"
                                          onError={(event) => {
                                            event.currentTarget.style.display = 'none';
                                          }}
                                        />
                                      ) : (
                                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-[#eef2ff] text-xs font-semibold text-[#1d4ed8]">
                                          {(league.name ?? 'L').trim().charAt(0).toUpperCase() || 'L'}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-slate-900">
                                          {league.name}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                          {league.country ?? 'International'} · Season{' '}
                                          {league.season ??
                                            (Array.isArray(league.seasons)
                                              ? league.seasons[0]
                                              : '—')}
                                        </p>
                                      </div>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-[#1d4ed8]" />
                                  </button>
                                ))}
                              </div>
                          </div>
                        )}
                        {fixtureSuggestions.length > 0 && (
                          <div>
                            <div className="border-b border-[#eef2ff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#8aa0ff]">
                              Fixtures
                            </div>
                            <div className="divide-y divide-[#eef2ff]">
                              {fixtureSuggestions.map((fixture) => {
                                const teams = normalizeTeams(fixture.teams);
                                const home = getTeamLabel(teams.home) || 'Home';
                                const away = getTeamLabel(teams.away) || 'Away';
                                const label =
                                  (fixtureHasTitle(fixture) ? fixture.title : undefined) ??
                                  `${home} vs ${away}`;
                                return (
                                  <button
                                    key={fixture.id}
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      handleFixtureSuggestionSelect(fixture);
                                    }}
                                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-slate-600 transition hover:bg-[#eef2ff]"
                                  >
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        {label}
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        {formatDate(fixture.date)} · {fixture.league.name ?? 'League'}
                                      </p>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-[#1d4ed8]" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={searchLoading}
                    className="cursor-pointer inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:translate-y-[-1px] hover:shadow-xl disabled:opacity-70"
                  >
                    {searchLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        Search Leagues
                      </>
                    )}
                  </button>
                  {hasSearchQuery && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-[#cbd6ff] hover:text-[#1d4ed8]"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </form>
              {searchError && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600">
                  <AlertCircle className="h-4 w-4" />
                  {searchError}
                </div>
              )}
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Football leagues
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-900">Choose a league</h2>
                  </div>
                  {leaguesLoading && (
                    <Loader2 className="h-5 w-5 animate-spin text-[#1d4ed8]" />
                  )}
                </div>
                {leaguesError && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600">
                    <AlertCircle className="h-4 w-4" />
                    {leaguesError}
                  </div>
                )}
                <div className="mt-5 grid gap-4">{leagueCards}</div>
                {totalLeaguePages > 1 && (
                  <div className="mt-4 flex items-center justify-between rounded-[18px] border border-[#cbd6ff] bg-white px-4 py-2 text-xs font-semibold text-slate-600">
                    <button
                      type="button"
                      onClick={goToPreviousLeaguePage}
                      disabled={currentLeaguePage === 1}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 transition ${
                        currentLeaguePage === 1
                          ? 'cursor-not-allowed border-slate-200 text-slate-300'
                          : 'border-[#cbd6ff] text-[#1d4ed8] hover:border-[#1d4ed8]'
                      }`}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </button>
                    <span>
                      Page {currentLeaguePage} of {totalLeaguePages}
                    </span>
                    <button
                      type="button"
                      onClick={goToNextLeaguePage}
                      disabled={currentLeaguePage === totalLeaguePages}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 transition ${
                        currentLeaguePage === totalLeaguePages
                          ? 'cursor-not-allowed border-slate-200 text-slate-300'
                          : 'border-[#cbd6ff] text-[#1d4ed8] hover:border-[#1d4ed8]'
                      }`}
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-[30px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_60px_rgba(79,70,229,0.08)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      Fixture board
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-900">
                      {activeSearchTerm
                        ? 'Search results'
                        : selectedLeague?.name ?? 'Select a league to load fixtures'}
                    </h2>
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1d4ed8]">
                    {pinnedEvents.length} pinned
                  </div>
                </div>
                {showFixtureFilters && (
                  <div className="mt-6 flex flex-wrap items-center gap-4 rounded-[22px] border border-[#cbd6ff] bg-gradient-to-r from-white via-[#f8f9ff] to-[#eef2ff] px-5 py-4 text-sm text-slate-600 shadow-[0_10px_30px_rgba(37,99,235,0.08)]">
                    <div className="flex flex-1 flex-wrap gap-4">
                      <div className="flex min-w-[260px] flex-1 flex-col rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-inner shadow-[#e0e7ff]">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                          <CalendarDays className="h-4 w-4 text-[#1d4ed8]" />
                          From date
                        </span>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <input
                            type="date"
                            min={currentYearStartIso}
                            value={fixtureDateFilter}
                            onChange={(event) => handleFixtureDateFilterChange(event.target.value)}
                            className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition focus:border-[#1d4ed8] focus:outline-none focus:ring-4 focus:ring-[#1d4ed8]/10"
                          />
                          {fixtureDateFilter && (
                            <button
                              type="button"
                              onClick={clearFixtureDateFilter}
                              className="text-xs font-semibold text-[#1d4ed8] hover:underline"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          Showing fixtures starting from the selected date this season.
                        </p>
                      </div>
                      <div className="flex min-w-[260px] flex-1 flex-col rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-inner shadow-[#e0e7ff]">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                          <Search className="h-4 w-4 text-[#1d4ed8]" />
                          Quick jump
                        </span>
                        <div className="mt-3">
                          <FixtureSearch
                            label="Fixture search"
                            placeholder="Search fixtures by club or matchup..."
                            onSelect={handleQuickFixtureSearchSelect}
                            selectedFixture={quickSearchFixture}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="min-w-[200px] rounded-2xl border border-white/70 bg-white px-4 py-3 text-center shadow-inner shadow-[#e0e7ff]">
                      <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                        Sort order
                      </span>
                      <button
                        type="button"
                        onClick={toggleFixtureSortDirection}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:scale-[1.01] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                      >
                        <ArrowUpDown className="h-4 w-4" />
                        {fixtureSortDirection === 'asc' ? 'Oldest first' : 'Newest first'}
                      </button>
                      <p className="mt-2 text-[11px] text-slate-400">
                        Toggle to flip the board order.
                      </p>
                    </div>
                  </div>
                )}
                <div className={showFixtureFilters ? 'mt-4' : 'mt-6'}>{fixturesContent}</div>
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default EventsPage;
