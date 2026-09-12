import type { PortfolioDividendEvent } from "@pea/shared";

/** Evenement de dividende enrichi du marqueur de projection, calcule cote frontend. */
export type DividendOverviewEvent = PortfolioDividendEvent & { projected?: boolean };

/**
 * Bornes appliquees a la croissance annuelle par action.
 *
 * La croissance est deduite du rapport entre l'annee de base et l'annee de reference. Un
 * historique partiel (premiere annee de detention, dividende exceptionnel) produit un rapport
 * aberrant : on limite la projection a +/- 50 % pour rester lisible et honnete.
 */
const MIN_GROWTH_RATE = 0.5;
const MAX_GROWTH_RATE = 1.5;

/**
 * Projette les dividendes d'une annee future a partir des deux annees qui la precedent.
 *
 * Pour chaque actif : le calendrier de l'annee de base (`targetYear - 1`) est decale d'un an,
 * le montant par action est ajuste par la croissance observee face a l'annee de reference
 * (`targetYear - 2`), et la quantite retenue est la derniere connue, plus proche de la
 * detention actuelle que celle d'un detachement passe.
 *
 * Un actif sans dividende sur l'annee de base n'est pas projete : rien ne permet d'en deduire
 * un calendrier credible.
 */
export function projectDividendYear(events: DividendOverviewEvent[], targetYear: number): DividendOverviewEvent[] {
  const { base: baseYear, reference: referenceYear } = projectionBasisYears(targetYear);
  const projected: DividendOverviewEvent[] = [];

  for (const symbolEvents of groupBySymbol(events).values()) {
    const baseEvents = symbolEvents.filter((event) => event.year === baseYear);
    const basePerShare = sumPerShare(baseEvents);
    if (basePerShare <= 0) continue;

    const referencePerShare = sumPerShare(symbolEvents.filter((event) => event.year === referenceYear));
    const growthRate = referencePerShare > 0 ? clamp(basePerShare / referencePerShare, MIN_GROWTH_RATE, MAX_GROWTH_RATE) : 1;
    const quantity = latestKnownQuantity(symbolEvents);

    for (const event of baseEvents) {
      const date = shiftOneYear(event.date);
      if (date === undefined) continue;
      const amountPerShare = safeNumber(event.amountPerShare) * growthRate;

      projected.push({
        ...event,
        amountPerShare,
        date,
        projected: true,
        quantity,
        status: "estimated",
        totalAmount: amountPerShare * quantity,
        year: targetYear
      });
    }
  }

  return projected.sort((a, b) => a.date.localeCompare(b.date));
}

/** Annees servant de base et de reference a la projection, pour l'affichage comme pour le calcul. */
export function projectionBasisYears(targetYear: number) {
  return { base: targetYear - 1, reference: targetYear - 2 };
}

function groupBySymbol(events: DividendOverviewEvent[]) {
  const bySymbol = new Map<string, DividendOverviewEvent[]>();
  for (const event of events) {
    const current = bySymbol.get(event.symbol);
    if (current) current.push(event);
    else bySymbol.set(event.symbol, [event]);
  }
  return bySymbol;
}

function sumPerShare(events: DividendOverviewEvent[]) {
  return events.reduce((sum, event) => sum + safeNumber(event.amountPerShare), 0);
}

function latestKnownQuantity(events: DividendOverviewEvent[]) {
  const latest = events.reduce((current, event) => (event.date.localeCompare(current.date) > 0 ? event : current), events[0]);
  return safeNumber(latest?.quantity);
}

/** Decale une date ISO d'une annee en UTC, en ramenant le 29 fevrier au 28 si besoin. */
function shiftOneYear(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;

  const year = date.getUTCFullYear() + 1;
  const month = date.getUTCMonth();
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDayOfMonth);

  return new Date(Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds())).toISOString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}
