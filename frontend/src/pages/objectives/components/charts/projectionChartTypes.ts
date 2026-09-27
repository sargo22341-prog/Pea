export interface ProjectionChartPoint {
  date: string;
  age: number;
  label: string;
  real?: number;
  projected?: number;
  projectedLow?: number | undefined;
  projectedHigh?: number | undefined;
  /** Intervalle Monte-Carlo [borne basse, borne haute] dessine autour de la mediane. */
  projectedRange?: [number, number] | undefined;
  objective?: number;
  possibleMonthlyIncome?: number | undefined;
  paidMonthlyIncome?: number | undefined;
}
