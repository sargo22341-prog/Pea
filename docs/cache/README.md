# Cache architecture

Phase 4 keeps the application cache-first, but makes the cache ownership explicit.

## Unified cache_entries

`cache_entries` is the shared table for Yahoo and frontend block caches that are simple key/value payloads:

- `scope`: cache family (`quote`, `dividends`, `news`, `fundamentals`, `history`, `asset_article`, frontend blocks, etc.).
- `key`: stable cache key inside the scope.
- `payload`: serialized JSON.
- `fetched_at`: source fetch time in milliseconds.
- `expires_at`: optional TTL boundary.

The `(scope, key)` unique constraint prevents cross-cache collisions while keeping one purge path for admin cleanup and asset rebuilds.

## Derived caches

Some caches stay outside `cache_entries` because they are derived from user state or need structured SQL predicates:

- `portfolio_chart_cache`: keyed by user/range and invalidated by portfolio transactions or market events.
- `portfolio_positions_performance_cache`: keyed by user/range and guarded by position versions plus market freshness.
- In-memory intraday chart cache: short-lived process-local protection against repeated live chart calls.

These caches are derived from persisted source data and can be rebuilt.

## TTL and stale guard

TTL is stored per entry when the data source has a natural expiry. Reads prefer fresh data, but stale data may be served when Yahoo fails or when a background refresh is already running. The stale guard is intentional: the UI stays responsive, and refresh paths update SQLite asynchronously.

Portfolio performance uses a stronger stale guard: it compares the cached portfolio version and relevant market timestamps before reusing a derived result.

## Event invalidation

Market writes emit typed SSE events through `/api/market/events`. Frontend listeners invalidate or reload blocks for:

- market snapshots,
- portfolio and watchlist assets,
- chart refresh start/update,
- portfolio performance refresh start/update,
- dashboard, analysis and dividends updates,
- scheduler health updates.

The event names are defined once in `shared/src/market.ts` as `MARKET_EVENT_TYPES` and `MarketEventType`.

## Outside the unified cache

The source-of-truth market tables are not caches:

- `chart_candles`
- `asset_quote_snapshot`
- `asset_quote_range`
- `asset_dividend_snapshot`
- `asset_financials`
- `asset_dividends`

They are persistent market data and are invalidated/rebuilt through dedicated repositories and construction tasks, not by deleting generic cache entries only.
