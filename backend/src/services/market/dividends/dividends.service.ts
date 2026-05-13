import type { DividendEvent } from "@pea/shared";
import { yahooApi } from "../../yahoo/yahoo.api.js";
import { assetRepository, type AssetRow } from "../../../repositories/market/asset.repository.js";
import { dividendsRepository } from "../../../repositories/market/dividends.repository.js";

export class DividendsService {
  async refreshDividends(asset: AssetRow | string) {
    const assetRow = typeof asset === "string" ? assetRepository.findBySymbol(asset) : asset;
    if (!assetRow) return { updated: 0 };
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 10);
    const chart = await yahooApi.chart(assetRow.symbol, { period1, period2: new Date(), interval: "1d", events: "div|split" });
    for (const dividend of chart.dividends) {
      dividendsRepository.upsert(assetRow.id, { date: dividend.date, amount: dividend.amount, currency: assetRow.currency ?? null });
    }
    return { updated: chart.dividends.length };
  }

  async refreshAllTracked() {
    let updated = 0;
    for (const symbol of assetRepository.listTrackedSymbols()) {
      let asset = assetRepository.findBySymbol(symbol);
      if (!asset) asset = assetRepository.upsertFromQuote((await yahooApi.quote(symbol)).snapshot);
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
