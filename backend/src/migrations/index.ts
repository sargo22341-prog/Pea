import { sessionIndexMigration } from "./001-session-index.js";
import { userProfileIconMigration } from "./002-user-profile-icon.js";
import { userAssetsUserIdMigration } from "./003-user-assets-user-id.js";
import { userPrivacyModeMigration } from "./004-user-privacy-mode.js";
import { chartCandlesIndexesMigration } from "./005-chart-candles-indexes.js";
import { chartCandlesRangeTablesMigration } from "./006-chart-candles-range-tables.js";
import { assetCalendarEventsMigration } from "./007-asset-calendar-events.js";
import { purgeFundamentalsCalendarCacheMigration } from "./008-purge-fundamentals-calendar-cache.js";
import { dropUnusedAssetDtoCachesMigration } from "./009-drop-unused-asset-dto-caches.js";
import { dropAssetDividendCacheMigration } from "./010-drop-asset-dividend-cache.js";
import { dropAssetChartCacheMigration } from "./011-drop-asset-chart-cache.js";
import { watchlistDefaultSortMigration } from "./012-watchlist-default-sort.js";
import { marketSchedulerMigration } from "./013-market-scheduler.js";
import { assetMarketSnapshotBidAskMigration } from "./014-asset-market-snapshot-bid-ask.js";
import { assetMarketSnapshotLastCheckedMigration } from "./015-asset-market-snapshot-last-checked.js";
import { frontendBlockCacheMigration } from "./016-frontend-block-cache.js";
import { portfolioPositionsPerformanceCacheMigration } from "./017-portfolio-positions-performance-cache.js";
import { marketDataFinalizationsIndexMigration } from "./018-market-data-finalizations-index.js";
import { assetMarketSnapshotSlowFieldsMigration } from "./019-asset-market-snapshot-slow-fields.js";
import { yahooUsageLogsMigration } from "./020-yahoo-usage-logs.js";
import { dedupeDividendsMigration } from "./021-dedupe-dividends.js";
import { dataConstructionQueueMigration } from "./022-data-construction-queue.js";
import { snapshotFreshnessAndCandleOrderIndexesMigration } from "./023-snapshot-freshness-and-candle-order-indexes.js";
import { positionsWatchlistNoDefaultUserIdMigration } from "./024-positions-watchlist-no-default-user-id.js";
import { unifiedCacheEntriesMigration } from "./025-unified-cache-entries.js";
import { dataConstructionPriorityMigration } from "./026-data-construction-priority.js";
import type { Migration } from "./types.js";

export const migrations: Migration[] = [
  sessionIndexMigration,
  userProfileIconMigration,
  userAssetsUserIdMigration,
  userPrivacyModeMigration,
  chartCandlesIndexesMigration,
  chartCandlesRangeTablesMigration,
  assetCalendarEventsMigration,
  purgeFundamentalsCalendarCacheMigration,
  dropUnusedAssetDtoCachesMigration,
  dropAssetDividendCacheMigration,
  dropAssetChartCacheMigration,
  watchlistDefaultSortMigration,
  marketSchedulerMigration,
  assetMarketSnapshotBidAskMigration,
  assetMarketSnapshotLastCheckedMigration,
  frontendBlockCacheMigration,
  portfolioPositionsPerformanceCacheMigration,
  marketDataFinalizationsIndexMigration,
  assetMarketSnapshotSlowFieldsMigration,
  yahooUsageLogsMigration,
  dedupeDividendsMigration,
  dataConstructionQueueMigration,
  snapshotFreshnessAndCandleOrderIndexesMigration,
  positionsWatchlistNoDefaultUserIdMigration,
  unifiedCacheEntriesMigration,
  dataConstructionPriorityMigration
];
