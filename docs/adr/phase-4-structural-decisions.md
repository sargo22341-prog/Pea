# ADR: Phase 4 structural decisions

## Single chart_candles table

Decision: replace range-specific candle tables with one `chart_candles` table and a `range_key` column.

Reason: all candle tables had the same schema and indexes. A single table removes duplicated repository logic, makes new ranges cheaper, and keeps uniqueness explicit with `(asset_id, range_key, interval, datetime_start)`.

Rollback: migration 027 recreates the previous range tables and copies rows back by `range_key` as a best-effort emergency rollback.

## Split asset snapshots

Decision: split `asset_market_snapshots` into `asset_quote_snapshot`, `asset_quote_range` and `asset_dividend_snapshot`, with a compatibility view named `asset_market_snapshots`.

Reason: volatile quote fields, semi-stable range fields and stable dividend fields have different freshness. Separate tables avoid overwriting slow fields during quote-only refreshes and make freshness timestamps easier to reason about.

Rollback: migration 028 recreates the legacy table from the three split tables as a best-effort rollback.

## MarketDataGateway and Yahoo facade

Decision: route market reads and fresh Yahoo fetches through a gateway/facade instead of calling yahoo-finance2 directly from feature services.

Reason: it centralizes retries, dedupe, usage tracking, cache/stale behavior and future provider replacement. Services choose between cached reads and fresh fetches explicitly.

## Explicit userId, no fallback

Decision: repositories that read or write user-owned portfolio/watchlist data require an explicit `userId`.

Reason: the old single-user fallback made isolation bugs too easy. Explicit IDs fail fast in tests and protect multi-user behavior.

## Unified cache

Decision: consolidate simple TTL JSON caches into `cache_entries`, while leaving structured derived caches in dedicated tables.

Reason: one table makes invalidation, admin cleanup and migration simpler for key/value cache data. Structured caches keep their own schema when SQL predicates, user version guards or range-specific invalidation matter.

Rollback: migration 025 recreates legacy cache tables and copies rows back by scope as a best-effort emergency rollback. History keys outside the expected `SYMBOL:range:interval` format cannot recover a precise legacy range.
