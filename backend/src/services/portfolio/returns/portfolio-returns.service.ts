import type { AssetChartDto, PortfolioReturnsDto, PortfolioYearReturn, Position } from "@pea/shared";
import { config } from "../../../config.js";
import { isHeldQuantity } from "../../../repositories/portfolio/held-positions.sql.js";
import { requireUserId } from "../../auth/user-context.js";
import { dividendsService } from "../../market/dividends/dividends.service.js";
import { marketDataService } from "../../market/data/market-data.service.js";
import { logger } from "../../shared/logger.service.js";
import { getZonedDateParts, zonedTimeToUtc } from "../../timezone/date-time.service.js";
import { isMarketDataUnavailable } from "../../yahoo/index.js";
import { buildTransactionCache, getQuantityAtTime } from "../portfolio-calculations.js";
import { chartPriceSeries, emptyPriceSeries } from "../portfolio-series.js";
import { portfolioReadService } from "../portfolio-read.service.js";
import { positionPerformanceService } from "../position-performance.service.js";
import { annualizedReturnPercent, periodReturn, type ReturnFlow } from "./period-returns.js";
import { positionCurrentValue, positionFlows, positionValueAt, type PositionHistory } from "./position-history.js";

/** Plage de cours couvrant tout l'historique, en clôtures journalières. */
const historyRange = "all";

interface LoadedHistory {
  history: PositionHistory;
  isPreparing: boolean;
  missingPrices: boolean;
}

function yearOf(timeMs: number) {
  return getZonedDateParts(new Date(timeMs), config.appTimezone).year;
}

/** Instant du 1er janvier à minuit, heure locale de l'application. */
function yearStartMs(year: number) {
  return zonedTimeToUtc(`${String(year)}-01-01`, "00:00", config.appTimezone).getTime();
}

/**
 * Rendement des titres dans le temps : chaque achat et chaque vente compte à sa date réelle.
 * Le TRI annualise l'ensemble ; le détail par année civile utilise la méthode de Dietz modifiée.
 */
export class PortfolioReturnsService {
  async returns(userId?: number | string, now = new Date()): Promise<PortfolioReturnsDto> {
    const resolvedUserId = requireUserId(userId);
    const nowMs = now.getTime();
    const positions = portfolioReadService.listPositions(resolvedUserId);
    const txCache = buildTransactionCache(positions.map((position) => position.id));
    const dated = positions.filter((position) => txCache.get(position.id)?.hasDated);
    const undatedSymbols = positions.filter((position) => !txCache.get(position.id)?.hasDated && isHeldQuantity(position.quantity)).map((position) => position.symbol);

    const loaded = await Promise.all(dated.map((position) => this.loadHistory(position, txCache.get(position.id)?.transactions ?? [], nowMs)));
    const histories = loaded.map((item) => item.history);
    const flows = histories.flatMap((history) => positionFlows(history, nowMs)).filter((flow) => flow.timeMs <= nowMs).sort((a, b) => a.timeMs - b.timeMs);
    const currentValue = histories.reduce((sum, history) => sum + positionCurrentValue(history, nowMs), 0);
    const totals = periodReturn({ startMs: Number.NEGATIVE_INFINITY, endMs: nowMs, startValue: 0, endValue: currentValue }, flows);
    const firstFlow = flows.find((flow) => flow.kind === "buy");

    return {
      annualizedReturnPercent: annualizedReturnPercent(flows, currentValue, nowMs),
      firstInvestmentAt: firstFlow ? new Date(firstFlow.timeMs).toISOString() : undefined,
      totalInvested: totals.invested,
      totalSold: totals.sold,
      totalDividends: totals.dividends,
      currentValue,
      totalGain: totals.gain,
      years: firstFlow ? this.yearReturns(histories, flows, firstFlow.timeMs, nowMs, currentValue) : [],
      isPreparing: loaded.some((item) => item.isPreparing),
      missingPriceSymbols: dated.filter((_, index) => loaded[index]?.missingPrices).map((position) => position.symbol),
      undatedSymbols
    };
  }

  /** Une ligne par année civile, du premier achat à aujourd'hui, valorisée au 31 décembre. */
  private yearReturns(histories: PositionHistory[], flows: ReturnFlow[], firstMs: number, nowMs: number, currentValue: number): PortfolioYearReturn[] {
    const valueAt = (timeMs: number) => histories.reduce((sum, history) => sum + positionValueAt(history, timeMs), 0);
    const firstYear = yearOf(firstMs);
    const currentYear = yearOf(nowMs);
    const years: PortfolioYearReturn[] = [];
    let startValue = 0;
    for (let year = firstYear; year <= currentYear; year += 1) {
      const isCurrent = year === currentYear;
      const startMs = year === firstYear ? firstMs : yearStartMs(year);
      // Le 31 décembre à 23:59:59.999 : l'année suivante commence à l'instant d'après, sans chevauchement.
      const endMs = isCurrent ? nowMs : yearStartMs(year + 1) - 1;
      const endValue = isCurrent ? currentValue : valueAt(endMs);
      const result = periodReturn({ startMs, endMs, startValue, endValue }, flows);
      years.push({ year, startValue, endValue, ...result, partial: isCurrent || year === firstYear });
      startValue = endValue;
    }
    return years;
  }

  private async loadHistory(position: Position, transactions: PositionHistory["transactions"], nowMs: number): Promise<LoadedHistory> {
    const chart = await this.chart(position.symbol);
    const series = chart ? chartPriceSeries(chart) : emptyPriceSeries;
    const held = getQuantityAtTime(transactions, nowMs) > 0;
    // Une position soldée vaut zéro aujourd'hui : aucune cotation n'est demandée pour elle.
    const currentPrice = held ? await positionPerformanceService.safeCurrentPrice(position) : 0;
    return {
      history: { transactions, series, dividends: this.dividends(position.symbol), currentPrice },
      isPreparing: chart?.isPreparing === true,
      missingPrices: series.times.length === 0
    };
  }

  private async chart(symbol: string): Promise<AssetChartDto | undefined> {
    try {
      return await marketDataService.getChartData(symbol, historyRange);
    } catch (error) {
      if (isMarketDataUnavailable(error)) return undefined;
      throw error;
    }
  }

  private dividends(symbol: string) {
    try {
      return dividendsService.readDividends(symbol);
    } catch (error) {
      logger.warn("portfolio", "dividends unavailable for returns", { symbol, error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }
}

export const portfolioReturnsService = new PortfolioReturnsService();
