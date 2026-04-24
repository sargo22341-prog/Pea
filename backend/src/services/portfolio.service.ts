import type { CreatePositionInput, PortfolioPerformancePoint, PortfolioSummary, Position, PositionWithMarket, RangeKey, UpdatePositionInput } from "@pea/shared";
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

  async summary(): Promise<PortfolioSummary> {
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
        history: await this.safeHistory(position.symbol, range)
      }))
    );

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
}

export const portfolioService = new PortfolioService();
