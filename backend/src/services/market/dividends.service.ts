/**
 * Role du fichier : stocker les dividendes fournis par les events chart Yahoo.
 * Yahoo ne fournit pas payment_date ou record_date ici, donc ces champs n'existent pas.
 */

import type { DividendEvent } from "@pea/shared";
import { db } from "../../db.js";
import { yahooApi } from "../yahoo/yahoo.api.js";
import { assetRepository, type AssetRow } from "./asset.repository.js";

export class DividendsService {
  async refreshDividends(asset: AssetRow | string) {
    const assetRow = typeof asset === "string" ? assetRepository.findBySymbol(asset) : asset;
    if (!assetRow) return { updated: 0 };
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 10);
    const chart = await yahooApi.chart(assetRow.symbol, { period1, period2: new Date(), interval: "1d", events: "div|split" });
    for (const dividend of chart.dividends) {
      db.prepare(
        `INSERT INTO asset_dividends (asset_id, ex_date, amount, currency, source)
         VALUES (?, ?, ?, ?, 'yahoo-finance2')
         ON CONFLICT(asset_id, ex_date, amount) DO UPDATE SET
           currency = excluded.currency,
           source = excluded.source,
           updated_at = CURRENT_TIMESTAMP`
      ).run(assetRow.id, dividend.date, dividend.amount, assetRow.currency ?? null);
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
    const rows = db
      .prepare("SELECT ex_date, amount, currency FROM asset_dividends WHERE asset_id = ? ORDER BY ex_date ASC")
      .all(asset.id) as Array<{ ex_date: string; amount: number; currency?: string }>;
    return rows.map((row) => ({
      symbol: asset.symbol,
      date: row.ex_date,
      amount: Number(row.amount),
      currency: row.currency ?? asset.currency ?? "EUR",
      status: "real"
    }));
  }
}

export const dividendsService = new DividendsService();
