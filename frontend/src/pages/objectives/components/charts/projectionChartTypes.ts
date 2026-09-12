export interface ProjectionChartPoint {
  date: string;
  age: number;
  label: string;
  real?: number;
  projected?: number;
  projectedLow?: number;
  projectedHigh?: number;
  /** Intervalle Monte-Carlo [borne basse, borne haute] dessine autour de la mediane. */
  projectedRange?: [number, number];
  objective?: number;
  possibleMonthlyIncome?: number;
  paidMonthlyIncome?: number;
}
