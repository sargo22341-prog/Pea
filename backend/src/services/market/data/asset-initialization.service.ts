import { assetRepository, type AssetRow } from "../../../repositories/market/asset.repository.js";
import { marketSnapshotService } from "../snapshots/market-snapshot.service.js";
import { marketDataGateway } from "./market-data-gateway.service.js";

export class AssetInitializationService {
  async ensureAssetInitialized(symbol: string): Promise<AssetRow> {
    const quote = await marketDataGateway.fetchFreshQuote(symbol);
    const asset = assetRepository.upsertFromQuote(quote.snapshot);
    const summary = await marketDataGateway.fetchFreshQuoteSummary(asset.symbol).catch(() => undefined);
    if (summary) assetRepository.upsertProfile(asset.id, summary.profile);
    await marketSnapshotService.refreshMarketSnapshot(asset);
    return asset;
  }
}

export const assetInitializationService = new AssetInitializationService();
