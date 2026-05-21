import { formatMaybeDate, money } from "../../../lib/format";

export function formatAge(age?: number) {
  if (age === undefined || !Number.isFinite(age)) return "n/a";
  return `${Math.round(age)} ans`;
}

export function formatObjectiveMoney(value?: number) {
  return value === undefined ? "n/a" : money(value, "EUR");
}

export function formatLeadLag(months?: number) {
  if (months === undefined || !Number.isFinite(months)) return "n/a";
  if (months === 0) return "A l'heure";
  return months > 0 ? `${Math.abs(months)} mois d'avance` : `${Math.abs(months)} mois de retard`;
}

export function formatObjectiveDate(value?: string) {
  return formatMaybeDate(value);
}
