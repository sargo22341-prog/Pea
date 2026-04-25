import type { CreatePositionInput, PortfolioPerformancePoint, PortfolioSummary, Position, PositionRangePerformance, PositionWithMarket, RangeKey, UpdatePositionInput } from "@pea/shared";
import { z } from "zod";
import { db } from "../db.js";
import { HttpError } from "../utils/http-error.js";
import { isMarketDataUnavailable, yahooService } from "./yahoo.service.js";

const createPositionSchema = z.object({
  symbol: z.string().trim().min(1).max(24),
  name: z.string().trim().optional(),
  quantity: z.number().positive(),
  averageBuyPrice: z.number().nonnegative(),
  currency: z.string().trim().min(3).max(8).default("EUR"),
  purchaseDate: z.string().trim().optional(),
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
    purchaseDate: row.purchase_date ?? undefined,
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
         SET quantity = ?, average_buy_price = ?, name = ?, currency = ?, purchase_date = COALESCE(?, purchase_date), updated_at = CURRENT_TIMESTAMP
         WHERE symbol = ?`
      ).run(newQuantity, weightedAverage, name, parsed.currency, parsed.purchaseDate ?? null, parsed.symbol);
    } else {
      db.prepare(
        `INSERT INTO positions (symbol, name, quantity, average_buy_price, currency, purchase_date)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(parsed.symbol, name, parsed.quantity, parsed.averageBuyPrice, parsed.currency, parsed.purchaseDate ?? null);
    }

    const position = db.prepare("SELECT * FROM positions WHERE symbol = ?").get(parsed.symbol) as any;
    db.prepare(
      `INSERT INTO transactions (position_id, type, quantity, price, currency, traded_at)
       VALUES (?, 'buy', ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`
    ).run(position.id, parsed.quantity, parsed.averageBuyPrice, parsed.currency, parsed.purchaseDate ?? null);

    return this.enrichPosition(mapPosition(position));
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
       SET quantity = ?, average_buy_price = ?, currency = ?, purchase_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(parsed.quantity, parsed.averageBuyPrice, parsed.currency, parsed.purchaseDate ?? null, parsed.notes ?? null, id);

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
          value += (lastPrices.get(symbol) ?? item.fallbackPrice) * item.position.quantity;
        }

        return { date, value, stale: histories.some((item) => item.history.some((point) => point.stale)) };
      });
    }

    const byDate = new Map<string, number>();
    for (const { position, history } of histories) {
      for (const point of history) {
        const date = point.date.slice(0, 10);
        byDate.set(date, (byDate.get(date) ?? 0) + point.close * position.quantity);
      }
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));
  }

  async positionsPerformance(range: RangeKey): Promise<PositionRangePerformance[]> {
    const positions = this.listPositions();
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

    const currentPrice = quote?.price || position.averageBuyPrice;
    const marketValue = currentPrice * position.quantity;
    const costBasis = position.averageBuyPrice * position.quantity;
    const performance = marketValue - costBasis;

    return {
      ...position,
      name: position.name || quote?.name || position.symbol,
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
    const [history, quoteResult] = await Promise.all([
      this.safeHistory(position.symbol, range),
      this.safeQuote(position)
    ]);
    const quote = quoteResult.quote;
    const validHistory = history.filter((point) => Number.isFinite(point.close)).sort((a, b) => a.date.localeCompare(b.date));
    const firstPoint = validHistory[0];
    const lastPoint = validHistory[validHistory.length - 1];
    const fallbackCurrentPrice = quote?.price || position.averageBuyPrice;
    const currentPrice = lastPoint?.close || fallbackCurrentPrice;
    const intervalStartPrice =
      firstPoint?.close ||
      (range === "1d" && quote?.previousClose ? quote.previousClose : undefined) ||
      currentPrice ||
      position.averageBuyPrice;

    const currentMarketValue = position.quantity * currentPrice;
    const intervalStartMarketValue = position.quantity * intervalStartPrice;
    const intervalPerformanceValue = currentMarketValue - intervalStartMarketValue;
    const intervalPerformancePercent = intervalStartMarketValue ? (intervalPerformanceValue / intervalStartMarketValue) * 100 : 0;
    const totalCost = position.quantity * position.averageBuyPrice;
    const totalPerformanceValue = currentMarketValue - totalCost;
    const totalPerformancePercent = totalCost ? (totalPerformanceValue / totalCost) * 100 : 0;
    const incompleteData = !firstPoint || !lastPoint || quoteResult.stale || history.some((point) => point.stale);

    return {
      ...position,
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
