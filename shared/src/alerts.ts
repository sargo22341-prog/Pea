/**
 * Alertes par utilisateur, évaluées après chaque rafraîchissement live des cotations, à partir
 * des données déjà stockées (aucun appel Yahoo supplémentaire).
 */
export const ALERT_TYPES = [
  "price_above",
  "price_below",
  "daily_change",
  "ma200_cross",
  "new_52w_high",
  "new_52w_low",
  "recommendation_change",
  "ex_dividend_announced"
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/** Types qui demandent un seuil (prix ou variation en %). */
export const ALERT_THRESHOLD_TYPES: readonly AlertType[] = ["price_above", "price_below", "daily_change"];

export const MA200_CROSS_DIRECTIONS = ["up", "down", "both"] as const;
export type Ma200CrossDirection = (typeof MA200_CROSS_DIRECTIONS)[number];

/** Anti-rebond par défaut : une alerte déclenchée se tait pendant ce délai. */
export const ALERT_COOLDOWN_HOURS = 24;
export const ALERT_LIMITS = {
  cooldownHours: { min: 1, max: 168 },
  /** Variation journalière absolue, en % (5 = ±5 %). */
  dailyChangePercent: { min: 0.1, max: 100 },
  price: { min: 0.0001, max: 1e9 },
  maxAlertsPerUser: 50,
  /** Derniers déclenchements affichés dans le menu de la cloche. */
  latestEvents: 5,
  historyPageSize: 100
} as const;

export interface AlertParams {
  /** Seuil de prix (`price_above`, `price_below`) ou de variation en % (`daily_change`). */
  threshold?: number | undefined;
  direction?: Ma200CrossDirection | undefined;
  cooldownHours?: number | undefined;
}

export interface UserAlert {
  id: number;
  symbol: string;
  assetName: string;
  currency?: string | undefined;
  type: AlertType;
  params: AlertParams;
  active: boolean;
  lastTriggeredAt?: string | undefined;
  createdAt: string;
}

/** Contexte figé au déclenchement, pour afficher « Cours 61,20 € au-dessus de 60 € ». */
export interface AlertEventPayload {
  price?: number | undefined;
  changePercent?: number | undefined;
  threshold?: number | undefined;
  ma200?: number | undefined;
  crossed?: "up" | "down" | undefined;
  previousHigh?: number | undefined;
  previousLow?: number | undefined;
  previousKey?: string | undefined;
  recommendationKey?: string | undefined;
  exDividendDate?: string | undefined;
  currency?: string | undefined;
}

export interface AlertEvent {
  id: number;
  alertId: number;
  symbol: string;
  assetName: string;
  type: AlertType;
  triggeredAt: string;
  payload: AlertEventPayload;
  read: boolean;
}

export interface AlertEventsPage {
  events: AlertEvent[];
  unread: number;
}
