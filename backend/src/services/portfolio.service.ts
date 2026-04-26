import type { CreatePositionInput, EditablePortfolioTransaction, PortfolioPerformancePoint, PortfolioSummary, Position, PositionRangePerformance, PositionTransactionStats, PositionWithMarket, RangeKey, UpdatePositionInput } from "@pea/shared";
import { z } from "zod";
import { db } from "../db.js";
import { HttpError } from "../utils/http-error.js";
import { logger } from "./logger.service.js";
import { isMarketDataUnavailable, yahooService } from "./yahoo.service.js";
import { calculateTransactionStats, legacyTransactionFromPosition } from "./portfolioTransactions.service.js";

const createPositionSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  name: z.string().trim().optional(),
  quantity: z.number().positive(),
  averageBuyPrice: z.number().nonnegative(),
  currency: z.string().trim().min(3).max(8).default("EUR"),
  notes: z.string().trim().optional()
});

function mapPosition(row: any): Position {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    quantity: row.quantity,
    averageBuyPrice: row.average_buy_price,
    currency: row.currency,
    notes: row.notes ?? undefined,
    createdAt: row.created_at
  };
}

export class PortfolioService {
  listPositions(): Position[] {
    const rows = db.prepare("SELECT * FROM positions ORDER BY symbol ASC").all();
    return rows.map(mapPosition);
  }

  async getPosition(symbol: string): Promise<PositionWithMarket | undefined> {
    const row = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(symbol.toUpperCase());
    if (!row) return undefined;
    return this.enrichPosition(mapPosition(row));
  }

  async createPosition(input: CreatePositionInput): Promise<PositionWithMarket> {
    const parsed = createPositionSchema.parse({
      ...input,
      symbol: input.symbol.toUpperCase()
    });

    let quoteName: string | undefined;
    try {
      const quote = await yahooService.quote(parsed.symbol);
      quoteName = quote.data.name;
    } catch (error) {
      if (!isMarketDataUnavailable(error)) {
        throw error;
      }
    }

    const name = parsed.name || quoteName || parsed.symbol;
    const existing = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(parsed.symbol) as any;

    if (existing) {
      const oldQuantity = Number(existing.quantity);
      const newQuantity = oldQuantity + parsed.quantity;
      const weightedAverage =
        newQuantity === 0
          ? parsed.averageBuyPrice
          : (oldQuantity * Number(existing.average_buy_price) + parsed.quantity * parsed.averageBuyPrice) / newQuantity;

      db.prepare(
        `UPDATE positions
         SET quantity = ?, average_buy_price = ?, name = ?, currency = ?, updated_at = CURRENT_TIMESTAMP
         WHERE symbol = ?`
      ).run(newQuantity, weightedAverage, name, parsed.currency, parsed.symbol);
    } else {
      db.prepare(
        `INSERT INTO positions (symbol, name, quantity, average_buy_price, currency)
         VALUES (?, ?, ?, ?, ?)`
      ).run(parsed.symbol, name, parsed.quantity, parsed.averageBuyPrice, parsed.currency);
    }

    const position = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(parsed.symbol) as any;
    db.prepare(
      `INSERT INTO transactions (position_id, type, quantity, price, currency, traded_at)
       VALUES (?, 'buy', ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(position.id, parsed.quantity, parsed.averageBuyPrice, parsed.currency);

    return this.enrichPosition(mapPosition(position));
  }

  async ensurePosition(symbol: string, name: string, currency = "EUR"): Promise<Position> {
    const normalizedSymbol = symbol.toUpperCase();
    const existing = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(normalizedSymbol) as any;
    if (existing) return mapPosition(existing);
    db.prepare(
      `INSERT INTO positions (symbol, name, quantity, average_buy_price, currency)
       VALUES (?, ?, 0, 0, ?)`
    ).run(normalizedSymbol, name, currency);
    const created = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(normalizedSymbol) as any;
    return mapPosition(created);
  }

  hasDatedTransactions(positionId: number): boolean {
    const row = db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE position_id = ? AND source = 'pdf_avis_opere' AND traded_at IS NOT NULL").get(positionId) as any;
    return Number(row?.count ?? 0) > 0;
  }

  getQuantityHeldAtDate(assetId: number | string, date: string): number {
    const time = new Date(date).getTime();
    if (!Number.isFinite(time)) return 0;
    const rows = db
      .prepare("SELECT type, quantity, traded_at FROM transactions WHERE position_id = ? AND source = 'pdf_avis_opere' ORDER BY traded_at ASC")
      .all(assetId) as Array<{ type: string; quantity: number; traded_at: string }>;
    return rows.reduce((quantity, row) => {
      if (new Date(row.traded_at).getTime() > time) return quantity;
      if (row.type === "buy") return quantity + Number(row.quantity);
      if (row.type === "sell") return quantity - Number(row.quantity);
      return quantity;
    }, 0);
  }

  recomputePositionFromDatedTransactions(positionId: number) {
    const rows = db
      .prepare("SELECT type, quantity, price, total_fees FROM transactions WHERE position_id = ? AND source = 'pdf_avis_opere' ORDER BY traded_at ASC, id ASC")
      .all(positionId) as Array<{ type: string; quantity: number; price: number; total_fees?: number }>;
    if (!rows.length) return;

    let quantity = 0;
    let costBasis = 0;
    for (const row of rows) {
      const rowQuantity = Number(row.quantity);
      if (row.type === "buy") {
        const buyCost = rowQuantity * Number(row.price) + Number(row.total_fees ?? 0);
        quantity += rowQuantity;
        costBasis += buyCost;
      } else if (row.type === "sell") {
        const averageCost = quantity > 0 ? costBasis / quantity : 0;
        quantity -= rowQuantity;
        costBasis = Math.max(0, costBasis - averageCost * rowQuantity);
      }
    }

    const averageBuyPrice = quantity > 0 ? costBasis / quantity : 0;
    db.prepare(
      `UPDATE positions
       SET quantity = ?, average_buy_price = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(quantity, averageBuyPrice, positionId);
  }

  listTransactions(positionId: number): EditablePortfolioTransaction[] {
    const rows = db.prepare("SELECT * FROM transactions WHERE position_id = ? ORDER BY traded_at DESC, id DESC").all(positionId) as any[];
    if (!rows.length) {
      const position = db.prepare("SELECT * FROM positions WHERE id = ?").get(positionId) as any;
      if (!position) return [];
      return [legacyTransactionFromPosition(mapPosition(position))];
    }

    return rows.map((row) => ({
      id: String(row.id),
      positionId: Number(row.position_id),
      assetId: String(row.position_id),
      source: row.source === "pdf_avis_opere" || row.source === "csv" ? row.source : "manual",
      sourceFileName: row.source_file_name ?? undefined,
      dateExecution: row.traded_at,
      tradedAt: row.traded_at,
      assetName: row.asset_name ?? undefined,
      isin: row.isin ?? undefined,
      ticker: row.ticker ?? undefined,
      type: row.type,
      quantity: Number(row.quantity),
      executedPrice: Number(row.price),
      price: Number(row.price),
      totalFees: row.total_fees == null ? undefined : Number(row.total_fees),
      currency: row.currency,
      rawTextSnippet: row.raw_text_snippet ?? undefined,
      createdAt: row.traded_at
    }));
  }

  transactionStats(positionId: number, totalDividendsReceived = 0, currency = "EUR"): PositionTransactionStats {
    const rows = this.listTransactions(positionId);
    return calculateTransactionStats(rows, totalDividendsReceived, currency);
  }

  updateTransaction(positionId: number, transactionId: number, input: { tradedAt: string; type: "buy" | "sell"; quantity: number; price: number; totalFees?: number; currency: string }) {
    const existing = db.prepare("SELECT id FROM transactions WHERE id = ? AND position_id = ?").get(transactionId, positionId);
    if (!existing) throw new HttpError(404, "Transaction introuvable");
    db.prepare(
      `UPDATE transactions
       SET traded_at = ?, type = ?, quantity = ?, price = ?, total_fees = ?, currency = ?
       WHERE id = ? AND position_id = ?`
    ).run(input.tradedAt, input.type, input.quantity, input.price, input.totalFees ?? 0, input.currency, transactionId, positionId);
    this.recomputePositionFromAnyTransactions(positionId);
    return this.listTransactions(positionId);
  }

  deleteTransaction(positionId: number, transactionId: number) {
    db.prepare("DELETE FROM transactions WHERE id = ? AND position_id = ?").run(transactionId, positionId);
    this.recomputePositionFromAnyTransactions(positionId);
  }

  recomputePositionFromAnyTransactions(positionId: number) {
    const rows = db
      .prepare("SELECT type, quantity, price, total_fees FROM transactions WHERE position_id = ? ORDER BY traded_at ASC, id ASC")
      .all(positionId) as Array<{ type: string; quantity: number; price: number; total_fees?: number }>;
    if (!rows.length) return;

    let quantity = 0;
    let costBasis = 0;
    for (const row of rows) {
      const rowQuantity = Number(row.quantity);
      if (row.type === "buy") {
        const buyCost = rowQuantity * Number(row.price) + Number(row.total_fees ?? 0);
        quantity += rowQuantity;
        costBasis += buyCost;
      } else if (row.type === "sell") {
        const averageCost = quantity > 0 ? costBasis / quantity : 0;
        quantity -= rowQuantity;
        costBasis = Math.max(0, costBasis - averageCost * rowQuantity);
      }
    }

    db.prepare("UPDATE positions SET quantity = ?, average_buy_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(quantity, quantity > 0 ? costBasis / quantity : 0, positionId);
  }

  deletePosition(id: number): boolean {
    const existing = db.prepare("SELECT id FROM positions WHERE id = ?").get(id);
    if (!existing) return false;
    db.prepare("DELETE FROM positions WHERE id = ?").run(id);
    return true;
  }

  async updatePosition(id: number, input: UpdatePositionInput): Promise<PositionWithMarket> {
    const parsed = createPositionSchema
      .omit({ symbol: true, name: true })
      .parse(input);
    const existing = db.prepare("SELECT * FROM positions WHERE id = ?").get(id) as any;
    if (!existing) throw new HttpError(404, "Position introuvable");

    db.prepare(
      `UPDATE positions
       SET quantity = ?, average_buy_price = ?, currency = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(parsed.quantity, parsed.averageBuyPrice, parsed.currency, parsed.notes ?? null, id);

    const row = db.prepare("SELECT * FROM positions WHERE id = ?").get(id) as any;
    return this.enrichPosition(mapPosition(row));
  }

  async summary(_range: RangeKey = "1d"): Promise<PortfolioSummary> {
    const positions = await Promise.all(this.listPositions().map((position) => this.enrichPosition(position)));
    const totalValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
    const totalCost = positions.reduce((sum, position) => sum + position.costBasis, 0);
    const totalPerformance = totalValue - totalCost;

    return {
      totalValue,
      totalCost,
      totalPerformance,
      totalPerformancePercent: totalCost ? (totalPerformance / totalCost) * 100 : 0,
      positionsCount: positions.reduce((sum, position) => sum + position.quantity, 0),
      assetsCount: positions.length,
      currency: "EUR",
      positions
    };
  }

  async performance(range: RangeKey): Promise<PortfolioPerformancePoint[]> {
    const positions = this.listPositions();
    if (!positions.length) return [];
    logger.debug("portfolio", "performance calculation", { range, positions: positions.length });

    const histories = await Promise.all(
      positions.map(async (position) => ({
        position,
        history: await this.safeHistory(position.symbol, range),
        fallbackPrice: await this.safeCurrentPrice(position)
      }))
    );
    if (range === "1d" || range === "1w" || range === "1m") {
      const timeline = [...new Set(histories.flatMap((item) => item.history.map((point) => point.date)))]
        .filter((date) => new Date(date).getTime() <= Date.now())
        .sort((a, b) => a.localeCompare(b));

      if (!timeline.length) {
        const fallbackValue = histories.reduce((sum, item) => sum + item.fallbackPrice * item.position.quantity, 0);
        return [{ date: new Date().toISOString(), value: fallbackValue, stale: true }];
      }

      const cursors = new Map<string, number>();
      const lastPrices = new Map<string, number>();
      for (const item of histories) {
        cursors.set(item.position.symbol, 0);
        lastPrices.set(item.position.symbol, item.fallbackPrice);
      }

      return timeline.map((date) => {
        const time = new Date(date).getTime();
        let value = 0;

        for (const item of histories) {
          const symbol = item.position.symbol;
          let cursor = cursors.get(symbol) ?? 0;
          while (cursor < item.history.length && new Date(item.history[cursor].date).getTime() <= time) {
            lastPrices.set(symbol, item.history[cursor].close);
            cursor += 1;
          }
          cursors.set(symbol, cursor);
          const quantity = this.hasDatedTransactions(item.position.id) ? this.getQuantityHeldAtDate(item.position.id, date) : item.position.quantity;
          value += (lastPrices.get(symbol) ?? item.fallbackPrice) * quantity;
        }

        return { date, value, stale: histories.some((item) => item.history.some((point) => point.stale)) };
      });
    }

    const byDate = new Map<string, number>();
    for (const { position, history } of histories) {
      for (const point of history) {
        const date = point.date.slice(0, 10);
        const quantity = this.hasDatedTransactions(position.id) ? this.getQuantityHeldAtDate(position.id, date) : position.quantity;
        byDate.set(date, (byDate.get(date) ?? 0) + point.close * quantity);
      }
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));
  }

  async positionsPerformance(range: RangeKey): Promise<PositionRangePerformance[]> {
    const positions = this.listPositions();
    logger.debug("portfolio", "positions performance calculation", { range, positions: positions.length });
    return Promise.all(positions.map((position) => this.positionRangePerformance(position, range)));
  }

  private async enrichPosition(position: Position): Promise<PositionWithMarket> {
    let quote;
    try {
      quote = (await yahooService.quote(position.symbol)).data;
    } catch (error) {
      if (!isMarketDataUnavailable(error)) {
        throw error;
      }
    }

    const dated = this.hasDatedTransactions(position.id);
    const effectivePosition = dated ? this.positionFromDatedTransactions(position) : position;
    const currentPrice = quote?.price || effectivePosition.averageBuyPrice;
    const marketValue = currentPrice * effectivePosition.quantity;
    const costBasis = effectivePosition.averageBuyPrice * effectivePosition.quantity;
    const performance = marketValue - costBasis;

    return {
      ...effectivePosition,
      name: effectivePosition.name || quote?.name || effectivePosition.symbol,
      quote,
      currentPrice,
      marketValue,
      costBasis,
      performance,
      performancePercent: costBasis ? (performance / costBasis) * 100 : 0,
      estimatedAnnualDividend: quote?.dividendRate ? quote.dividendRate * position.quantity : undefined,
      marketDataUnavailable: !quote || quote.unavailable
    };
  }

  private positionFromDatedTransactions(position: Position): Position {
    const rows = db
      .prepare("SELECT type, quantity, price, total_fees FROM transactions WHERE position_id = ? AND source = 'pdf_avis_opere' ORDER BY traded_at ASC, id ASC")
      .all(position.id) as Array<{ type: string; quantity: number; price: number; total_fees?: number }>;
    if (!rows.length) return position;

    let quantity = 0;
    let costBasis = 0;
    for (const row of rows) {
      const rowQuantity = Number(row.quantity);
      if (row.type === "buy") {
        const buyCost = rowQuantity * Number(row.price) + Number(row.total_fees ?? 0);
        quantity += rowQuantity;
        costBasis += buyCost;
      } else if (row.type === "sell") {
        const averageCost = quantity > 0 ? costBasis / quantity : 0;
        quantity -= rowQuantity;
        costBasis = Math.max(0, costBasis - averageCost * rowQuantity);
      }
    }

    return {
      ...position,
      quantity,
      averageBuyPrice: quantity > 0 ? costBasis / quantity : 0
    };
  }

  private async safeHistory(symbol: string, range: RangeKey) {
    try {
      return (await yahooService.history(symbol, range)).data;
    } catch (error) {
      if (isMarketDataUnavailable(error)) return [];
      throw error;
    }
  }

  private async safeCurrentPrice(position: Position) {
    try {
      const quote = await yahooService.quote(position.symbol);
      return quote.data.price || position.averageBuyPrice;
    } catch (error) {
      if (isMarketDataUnavailable(error)) return position.averageBuyPrice;
      throw error;
    }
  }

  private async positionRangePerformance(position: Position, range: RangeKey): Promise<PositionRangePerformance> {
    const effectivePosition = this.hasDatedTransactions(position.id) ? this.positionFromDatedTransactions(position) : position;
    const [history, quoteResult] = await Promise.all([
      this.safeHistory(effectivePosition.symbol, range),
      this.safeQuote(effectivePosition)
    ]);
    const quote = quoteResult.quote;
    const validHistory = history.filter((point) => Number.isFinite(point.close)).sort((a, b) => a.date.localeCompare(b.date));
    const firstPoint = validHistory[0];
    const lastPoint = validHistory[validHistory.length - 1];
    const fallbackCurrentPrice = quote?.price || effectivePosition.averageBuyPrice;
    const currentPrice = lastPoint?.close || fallbackCurrentPrice;
    const intervalStartPrice =
      firstPoint?.close ||
      (range === "1d" && quote?.previousClose ? quote.previousClose : undefined) ||
      currentPrice ||
      effectivePosition.averageBuyPrice;

    const currentMarketValue = effectivePosition.quantity * currentPrice;
    const intervalQuantity = this.hasDatedTransactions(effectivePosition.id) && firstPoint ? this.getQuantityHeldAtDate(effectivePosition.id, firstPoint.date) : effectivePosition.quantity;
    const intervalStartMarketValue = intervalQuantity * intervalStartPrice;
    const intervalPerformanceValue = currentMarketValue - intervalStartMarketValue;
    const intervalPerformancePercent = intervalStartMarketValue ? (intervalPerformanceValue / intervalStartMarketValue) * 100 : 0;
    const totalCost = effectivePosition.quantity * effectivePosition.averageBuyPrice;
    const totalPerformanceValue = currentMarketValue - totalCost;
    const totalPerformancePercent = totalCost ? (totalPerformanceValue / totalCost) * 100 : 0;
    const incompleteData = !firstPoint || !lastPoint || quoteResult.stale || history.some((point) => point.stale);

    return {
      ...effectivePosition,
      currentPrice,
      currentMarketValue,
      intervalStartPrice,
      intervalStartMarketValue,
      intervalPerformanceValue,
      intervalPerformancePercent,
      totalPerformanceValue,
      totalPerformancePercent,
      stale: incompleteData,
      incompleteData
    };
  }

  private async safeQuote(position: Position) {
    try {
      const result = await yahooService.quote(position.symbol);
      return { quote: result.data, stale: result.stale || result.data.stale || result.data.unavailable };
    } catch (error) {
      if (isMarketDataUnavailable(error)) return { quote: undefined, stale: true };
      throw error;
    }
  }

}

export const portfolioService = new PortfolioService();
