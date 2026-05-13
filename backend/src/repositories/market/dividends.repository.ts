import type { DividendEvent } from "@pea/shared";
import { db } from "../../db.js";

export class DividendsRepository {
  upsert(assetId: number, input: { date: string; amount: number; currency?: string | null }) {
    db.prepare("DELETE FROM asset_dividends WHERE asset_id = ? AND ex_date = ? AND amount <> ?").run(assetId, input.date, input.amount);
    db.prepare(
      `INSERT INTO asset_dividends (asset_id, ex_date, amount, currency, source)
       VALUES (?, ?, ?, ?, 'yahoo-finance2')
       ON CONFLICT(asset_id, ex_date, amount) DO UPDATE SET
         currency = excluded.currency,
         source = excluded.source,
         updated_at = CURRENT_TIMESTAMP`
    ).run(assetId, input.date, input.amount, input.currency ?? null);
  }

  read(asset: { id: number; symbol: string; currency?: string }): DividendEvent[] {
    const rows = db
      .prepare("SELECT ex_date, amount, currency FROM asset_dividends WHERE asset_id = ? ORDER BY ex_date ASC, updated_at ASC, id ASC")
      .all(asset.id) as Array<{ ex_date: string; amount: number; currency?: string }>;
    const latestByDate = new Map<string, { ex_date: string; amount: number; currency?: string }>();
    for (const row of rows) latestByDate.set(row.ex_date, row);
    return [...latestByDate.values()].map((row) => ({
      symbol: asset.symbol,
      date: row.ex_date,
      amount: Number(row.amount),
      currency: row.currency ?? asset.currency ?? "EUR",
      status: "real"
    }));
  }
}

export const dividendsRepository = new DividendsRepository();
