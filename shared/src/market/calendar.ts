export type CalendarEventType = "earnings" | "earnings_call" | "ex_dividend" | "dividend";

/** Actifs couverts par le calendrier : positions, liste de suivi, ou les deux. */
export const CALENDAR_SCOPES = ["portfolio", "watchlist", "all"] as const;
export type CalendarScope = (typeof CALENDAR_SCOPES)[number];

/** Écart maximal entre les bornes `from` et `to` d'une requête du calendrier. */
export const CALENDAR_MAX_RANGE_DAYS = 400;

/** Versement attendu pour la position de l'utilisateur (quantité × dividende par action). */
export interface CalendarExpectedDividend {
  amount: number;
  amountPerShare: number;
  quantity: number;
  currency: string;
  /** Détaché, annoncé par la société ou estimé d'après l'an dernier. */
  status: "real" | "announced" | "estimated";
}

export interface CalendarEvent {
  id: number;
  symbol: string;
  eventType: CalendarEventType;
  eventDate: string;
  isEstimate: boolean;
  assetName: string;
  currency?: string | undefined;
  /** Consensus de la prochaine publication de résultats. */
  epsAverage?: number | undefined;
  revenueAverage?: number | undefined;
  /** Montant attendu d'un détachement ou d'un versement (positions de l'utilisateur uniquement). */
  expectedDividend?: CalendarExpectedDividend | undefined;
}
