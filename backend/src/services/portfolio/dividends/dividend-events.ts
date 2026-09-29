import { DAY_MS, type CurrencyCode, type DividendEvent, type PortfolioDividendEvent, type PortfolioDividendStatus, type PositionWithMarket } from "@pea/shared";
import { positionYieldOnCost } from "../insights/yield-on-cost.js";
import { isSamePayment, withAnnouncedDividend } from "./announced-dividend.js";

/**
 * Délai pendant lequel une estimation dépassée reste affichée : le détachement réel n'est
 * enregistré qu'au rafraîchissement quotidien des dividendes.
 */
export const ESTIMATE_PAST_GRACE_DAYS = 7;
const YEAR_MS = 365 * DAY_MS;

/** Indicateurs d'une position répétés sur chacun de ses versements. */
export interface DividendMetrics {
  annualDividendRate?: number | undefined;
  dividendPercent?: number | undefined;
  yieldOnCostPercent?: number | undefined;
  payoutRatio?: number | undefined;
}

export interface PositionDividendInput {
  position: PositionWithMarket;
  /** Détachements réels de l'actif (historique Yahoo stocké). */
  dividends: DividendEvent[];
  metrics: DividendMetrics;
  /** Quantité détenue à un instant, transactions datées et divisions d'action prises en compte. */
  quantityAt: (time: number) => number;
  now: Date;
  /** Prochaine date de détachement publiée par la société (ISO, future). */
  nextExDividendDate?: string | undefined;
}

export function dividendMetrics(position: PositionWithMarket, payoutRatio: number | undefined): DividendMetrics {
  const annualDividendRate = position.quote?.dividendRate;
  const dividendPercent =
    annualDividendRate !== undefined && Number.isFinite(annualDividendRate) && position.currentPrice ? (annualDividendRate / position.currentPrice) * 100 : undefined;
  const yieldOnCost = positionYieldOnCost(annualDividendRate, position.averageBuyPrice);
  return {
    annualDividendRate,
    dividendPercent,
    yieldOnCostPercent: yieldOnCost === undefined ? undefined : yieldOnCost * 100,
    payoutRatio
  };
}

function addOneYear(date: string): string {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + 1);
  return next.toISOString();
}

function yearFromDate(date: string): number | undefined {
  const year = new Date(date).getFullYear();
  return Number.isFinite(year) ? year : undefined;
}

function dividendEvent(
  input: PositionDividendInput,
  event: { date: string; amountPerShare: number; currency: CurrencyCode; status: PortfolioDividendStatus; stale?: boolean | undefined; quantity?: number }
): PortfolioDividendEvent {
  const quantity = event.quantity ?? input.quantityAt(new Date(event.date).getTime());
  return {
    symbol: input.position.symbol,
    name: input.position.name,
    date: event.date,
    year: new Date(event.date).getFullYear(),
    amountPerShare: event.amountPerShare,
    quantity,
    totalAmount: event.amountPerShare * quantity,
    currency: event.currency,
    status: event.status,
    ...input.metrics,
    stale: event.stale
  };
}

/** Détachements réels, avec la quantité détenue à chaque date. */
export function realDividendEvents(input: PositionDividendInput): PortfolioDividendEvent[] {
  return input.dividends.map((event) => dividendEvent(input, { date: event.date, amountPerShare: event.amount, currency: event.currency, status: "real", stale: event.stale }));
}

/**
 * Versements à venir, par ordre de fiabilité : un détachement annoncé remplace l'estimation
 * correspondante ; sinon le calendrier de l'an dernier est reconduit ; à défaut, le dividende
 * annuel est placé en fin d'année. Une estimation déjà versée (à quelques semaines près) ou
 * dépassée sans versement n'est pas reprise.
 */
export function upcomingDividendEvents(input: PositionDividendInput): PortfolioDividendEvent[] {
  const { position, dividends, now } = input;
  const currentYear = now.getFullYear();
  const realTimes = dividends.map((event) => Date.parse(event.date)).filter((time) => Number.isFinite(time));
  const alreadyPaid = (time: number) => realTimes.some((realTime) => isSamePayment(realTime, time));
  const lastYearDividends = dividends.filter((event) => yearFromDate(event.date) === currentYear - 1);
  const oldestUpcomingTime = now.getTime() - ESTIMATE_PAST_GRACE_DAYS * DAY_MS;

  const estimated = lastYearDividends.flatMap((event) => {
    const date = addOneYear(event.date);
    const time = Date.parse(date);
    if (!Number.isFinite(time) || time < oldestUpcomingTime || alreadyPaid(time)) return [];
    return [dividendEvent(input, { date, amountPerShare: event.amount, currency: event.currency, status: "estimated", stale: event.stale })];
  });

  const announcedDate = input.nextExDividendDate;
  const annualRate = input.metrics.annualDividendRate;
  const announcedTime = announcedDate === undefined ? Number.NaN : Date.parse(announcedDate);
  if (announcedDate !== undefined && annualRate !== undefined && Number.isFinite(announcedTime) && !alreadyPaid(announcedTime)) {
    const currency = lastYearDividends[0]?.currency ?? position.currency;
    const trailingYearPayments = dividends
      .filter((event) => {
        const time = Date.parse(event.date);
        return time < announcedTime && time >= announcedTime - YEAR_MS;
      })
      .map((event) => event.amount);
    const announcement = { exDividendDate: announcedDate, annualDividendRate: annualRate, trailingYearPayments };
    const withAnnouncement = withAnnouncedDividend(estimated, announcement, (date, amountPerShare) => dividendEvent(input, { date, amountPerShare, currency, status: "announced" }));
    if (withAnnouncement.some((event) => event.status === "announced")) return withAnnouncement;
  }

  const paidThisYear = dividends.some((event) => yearFromDate(event.date) === currentYear);
  if (!lastYearDividends.length && !paidThisYear && position.estimatedAnnualDividend) {
    const amountPerShare = position.quantity ? position.estimatedAnnualDividend / position.quantity : 0;
    return [dividendEvent(input, {
      date: new Date(currentYear, 11, 31).toISOString(),
      amountPerShare,
      currency: position.currency,
      status: "estimated",
      quantity: position.quantity
    })];
  }
  return estimated;
}
