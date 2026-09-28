/** Bénéfice par action publié face au consensus d'un trimestre. */
export interface EarningsQuarter {
  /** Libellé Yahoo du trimestre fiscal, par exemple `2Q2026`. */
  period: string;
  endDate?: string | undefined;
  epsEstimate?: number | undefined;
  epsActual?: number | undefined;
  /** Écart relatif au consensus en fraction (0,05 = battu de 5 %). */
  surprisePercent?: number | undefined;
}

/** Estimations de la prochaine publication (module `calendarEvents`). */
export interface NextEarnings {
  date?: string | undefined;
  isEstimate: boolean;
  epsAverage?: number | undefined;
  epsLow?: number | undefined;
  epsHigh?: number | undefined;
  revenueAverage?: number | undefined;
  revenueLow?: number | undefined;
  revenueHigh?: number | undefined;
}

/** Résultats trimestriels (modules `earningsHistory`, `earnings`, `calendarEvents`). */
export interface AssetEarnings {
  /** Du plus ancien au plus récent, quatre trimestres au plus. */
  quarters: EarningsQuarter[];
  next?: NextEarnings | undefined;
  currency?: string | undefined;
}
