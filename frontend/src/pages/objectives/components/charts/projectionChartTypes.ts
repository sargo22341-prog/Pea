export interface ProjectionChartPoint {
  date: string;
  age: number;
  label: string;
  real?: number;
  projected?: number;
  objective?: number;
  possibleMonthlyIncome?: number;
  paidMonthlyIncome?: number;
}
