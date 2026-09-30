import { marketDataConstructionRepository } from "../../../repositories/market/construction.repository.js";
import type { StoredChartRange } from "../charts/chart-config.service.js";
import type { ConstructionTask } from "./data-construction-task.js";

/**
 * Exécute une tâche de construction. Les services de données sont chargés à la demande pour
 * éviter une dépendance circulaire avec la file, qu'ils alimentent eux-mêmes.
 */
export async function executeConstructionTask(task: ConstructionTask) {
  const [{ marketDataService }, { marketSnapshotService }, { financialsService }, { dividendsService }, { assetRepository }, { marketDataGateway }] = await Promise.all([
    import("../data/market-data.service.js"),
    import("../snapshots/market-snapshot.service.js"),
    import("../financials/financials.service.js"),
    import("../dividends/dividends.service.js"),
    import("../../../repositories/market/asset.repository.js"),
    import("../data/market-data-gateway.service.js")
  ]);
  if (!task.symbol) return;
  let asset = assetRepository.findBySymbol(task.symbol);
  asset ??= await marketDataService.ensureAssetInitialized(task.symbol);
  if (task.type === "candles") await marketDataService.refreshCandlesForAsset(asset, task.range ? [task.range as StoredChartRange] : undefined);
  if (task.type === "finalize") await marketDataService.finalizePostCloseForAsset(asset);
  if (task.type === "rebuild-stored") await marketDataService.rebuildStoredRangesFromFinalData(asset, task.range ? [task.range as StoredChartRange] : undefined);
  if (task.type === "snapshot") await marketSnapshotService.refreshMarketSnapshot(asset);
  if (task.type === "financials") await financialsService.refreshFinancials(asset);
  if (task.type === "dividends") await dividendsService.refreshDividends(asset);
  if (task.type === "calendar-events") {
    marketDataConstructionRepository.clearCachedFundamentals(asset.symbol);
    const marketInfo = await marketDataGateway.readMarketInfoWithCache(asset.symbol);
    marketSnapshotService.upsertMarketInfo(asset.id, marketInfo.data);
    await marketDataGateway.readExtraDataWithCache(asset.symbol); // quoteSummary (9 modules) -> upsert calendar events
    await financialsService.refreshFinancials(asset);  // fundamentalsTimeSeries → upsert asset_financials
  }
}
