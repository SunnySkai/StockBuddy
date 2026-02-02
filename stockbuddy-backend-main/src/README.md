# StockBuddy Backend

## Football data integration

The football routes depend on the [API-Football](https://dashboard.api-football.com/) service.
Add the following environment variables before running the server:

- `API_FOOTBALL_KEY`: your API-Football key (required)
- `API_FOOTBALL_CACHE_TTL_MS`: optional TTL (milliseconds) for cached responses, defaults to 5 minutes; set to `0` to disable caching
- `API_FOOTBALL_BASE_URL`: optional override for the base URL, defaults to `https://api-football-v1.p.rapidapi.com/v3`
- `API_FOOTBALL_HOST`: optional override for the host header, defaults to `api-football-v1.p.rapidapi.com`

Available endpoints (all require authentication):

- `GET /api/events` - aggregate catalog for sports and live entertainment categories
- `GET /api/events/sports` - list sports offerings (football available, others marked coming soon)
- `GET /api/events/sports/football/leagues?season=2024&country=England` - list football leagues with optional filters
- `GET /api/events/sports/football/leagues/:leagueId/fixtures?season=2024` - list fixtures for a league
- `GET /api/events/search?q=chelsea` - global search across football fixtures
- `GET /api/events/my` - list the authenticated user's pinned events
- `POST /api/events/my` - body `{ "fixtureId": "<fixture id>" }` to pin an event
- `DELETE /api/events/my/:fixtureId` - unpin a previously saved event
- `GET /api/football/fixtures` - fetch fixtures using query filters (`date`, `league`, `season`, `team`, `status`, `timezone`, `fixture`, `live`)
- `GET /api/football/fixtures/:fixtureId` - fetch a single fixture by ID
- `GET /api/football/fixtures/:fixtureId/events` - fetch all events for a fixture (optional filters: `team`, `player`, `type`)

Live and event responses use cache entries tailored per endpoint to limit paid API calls while keeping live data fresh. Use the `My Events` routes to persist a user's pinned fixtures so the dashboard can surface them instantly.
