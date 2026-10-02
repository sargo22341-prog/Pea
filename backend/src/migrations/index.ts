import { sessionIndexMigration } from "./foundation/001-session-index.js";
import { userProfileIconMigration } from "./foundation/002-user-profile-icon.js";
import { userAssetsUserIdMigration } from "./foundation/003-user-assets-user-id.js";
import { userPrivacyModeMigration } from "./foundation/004-user-privacy-mode.js";
import { chartCandlesIndexesMigration } from "./foundation/005-chart-candles-indexes.js";
import { chartCandlesRangeTablesMigration } from "./foundation/006-chart-candles-range-tables.js";
import { assetCalendarEventsMigration } from "./foundation/007-asset-calendar-events.js";
import { purgeFundamentalsCalendarCacheMigration } from "./foundation/008-purge-fundamentals-calendar-cache.js";
import { dropUnusedAssetDtoCachesMigration } from "./cache/009-drop-unused-asset-dto-caches.js";
import { dropAssetDividendCacheMigration } from "./cache/010-drop-asset-dividend-cache.js";
import { dropAssetChartCacheMigration } from "./cache/011-drop-asset-chart-cache.js";
import { watchlistDefaultSortMigration } from "./cache/012-watchlist-default-sort.js";
import { marketSchedulerMigration } from "./cache/013-market-scheduler.js";
import { assetMarketSnapshotBidAskMigration } from "./cache/014-asset-market-snapshot-bid-ask.js";
import { assetMarketSnapshotLastCheckedMigration } from "./cache/015-asset-market-snapshot-last-checked.js";
import { frontendBlockCacheMigration } from "./cache/016-frontend-block-cache.js";
import { portfolioPositionsPerformanceCacheMigration } from "./market/017-portfolio-positions-performance-cache.js";
import { marketDataFinalizationsIndexMigration } from "./market/018-market-data-finalizations-index.js";
import { assetMarketSnapshotSlowFieldsMigration } from "./market/019-asset-market-snapshot-slow-fields.js";
import { yahooUsageLogsMigration } from "./market/020-yahoo-usage-logs.js";
import { dedupeDividendsMigration } from "./market/021-dedupe-dividends.js";
import { dataConstructionQueueMigration } from "./market/022-data-construction-queue.js";
import { snapshotFreshnessAndCandleOrderIndexesMigration } from "./market/023-snapshot-freshness-and-candle-order-indexes.js";
import { positionsWatchlistNoDefaultUserIdMigration } from "./market/024-positions-watchlist-no-default-user-id.js";
import { unifiedCacheEntriesMigration } from "./market/025-unified-cache-entries.js";
import { dataConstructionPriorityMigration } from "./market/026-data-construction-priority.js";
import { unifiedChartCandlesMigration } from "./market/027-unified-chart-candles.js";
import { snapshotSplitMigration } from "./market/028-snapshot-split.js";
import { bootstrapAdminMigration } from "./accounts/029-bootstrap-admin.js";
import { userLanguageMigration } from "./accounts/030-user-language.js";
import { objectivesMigration } from "./accounts/031-objectives.js";
import { userPreferencesColumnsMigration } from "./accounts/032-user-preferences-columns.js";
import { transactionTradedAtIsoMigration } from "./portfolio/033-transaction-traded-at-iso.js";
import { dropRedundantChartCandleIndexesMigration } from "./storage/034-drop-redundant-chart-candle-indexes.js";
import { incrementalAutoVacuumMigration } from "./storage/035-incremental-auto-vacuum.js";
import { userAdvancedModeMigration } from "./accounts/036-user-advanced-mode.js";
import { assetSplitsMigration } from "./portfolio/037-asset-splits.js";
import { expireFundamentalsMissingModulesMigration } from "./cache/038-expire-fundamentals-missing-modules.js";
import { appFeatureFlagsMigration } from "./admin/039-app-feature-flags.js";
import { yahooUsageFeatureMigration } from "./admin/040-yahoo-usage-feature.js";
import { calendarEarningsEstimatesMigration } from "./market/041-calendar-earnings-estimates.js";
import { assetRecommendationHistoryMigration } from "./market/042-asset-recommendation-history.js";
import { userScreenerPresetsMigration } from "./accounts/043-user-screener-presets.js";
import { userAlertsMigration } from "./alerts/044-user-alerts.js";
import { materializeLegacyPositionSnapshotsMigration } from "./portfolio/045-materialize-legacy-position-snapshots.js";
import { expireNewsCacheMigration } from "./cache/046-expire-news-cache.js";
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
  dataConstructionPriorityMigration,
  unifiedChartCandlesMigration,
  snapshotSplitMigration,
  bootstrapAdminMigration,
  userLanguageMigration,
  objectivesMigration,
  userPreferencesColumnsMigration,
  transactionTradedAtIsoMigration,
  dropRedundantChartCandleIndexesMigration,
  incrementalAutoVacuumMigration,
  userAdvancedModeMigration,
  assetSplitsMigration,
  expireFundamentalsMissingModulesMigration,
  appFeatureFlagsMigration,
  yahooUsageFeatureMigration,
  calendarEarningsEstimatesMigration,
  assetRecommendationHistoryMigration,
  userScreenerPresetsMigration,
  userAlertsMigration,
  materializeLegacyPositionSnapshotsMigration,
  expireNewsCacheMigration
];
