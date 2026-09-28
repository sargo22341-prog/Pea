import { DIVIDEND_HISTORY_YEARS, type DividendEvent } from "@pea/shared";
import { assetRepository, type AssetRow } from "../../../repositories/market/asset.repository.js";
import { dividendsRepository } from "../../../repositories/market/dividends.repository.js";
import { marketDataGateway } from "../data/market-data-gateway.service.js";
import { assetSplitsService } from "../splits/asset-splits.service.js";

export class DividendsService {
  async refreshDividends(asset: AssetRow | string) {
    const assetRow = typeof asset === "string" ? assetRepository.findBySymbol(asset) : asset;
    if (!assetRow) return { updated: 0 };
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - DIVIDEND_HISTORY_YEARS);
    const chart = await marketDataGateway.fetchFreshChart(assetRow.symbol, { period1, period2: new Date(), interval: "1d", events: "div|split" });
    for (const dividend of chart.dividends) {
      dividendsRepository.upsert(assetRow.id, { date: dividend.date, amount: dividend.amount, currency: assetRow.currency ?? null });
    }
    // Même appel `chart` (événements div|split) : les divisions sont enregistrées sans coût Yahoo supplémentaire.
    assetSplitsService.recordSplits(assetRow, chart.splits, "yahoo-chart");
    return { updated: chart.dividends.length };
  }

  async refreshAllTracked() {
    let updated = 0;
    for (const symbol of assetRepository.listTrackedSymbols()) {
      let asset = assetRepository.findBySymbol(symbol);
      asset ??= assetRepository.upsertFromQuote((await marketDataGateway.fetchFreshQuote(symbol)).snapshot);
      updated += (await this.refreshDividends(asset)).updated;
    }
    return { updated };
  }

  readDividends(symbol: string): DividendEvent[] {
    const asset = assetRepository.findBySymbol(symbol);
    if (!asset) return [];
    return dividendsRepository.read(asset);
  }
}

export const dividendsService = new DividendsService();
