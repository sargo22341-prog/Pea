/** Mois `AAAA-MM` : calculs sans fuseau (un mois est une étiquette, pas un instant). */

function parts(period: string) {
  const [year = 0, month = 1] = period.split("-").map(Number);
  return { year, month };
}

function format(year: number, month: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function nextPeriod(period: string) {
  const { year, month } = parts(period);
  return month === 12 ? format(year + 1, 1) : format(year, month + 1);
}

export function previousPeriod(period: string) {
  const { year, month } = parts(period);
  return month === 1 ? format(year - 1, 12) : format(year, month - 1);
}

/** Mois de `from` à `to` inclus, dans l'ordre ; vide si `to` précède `from`. */
export function periodsBetween(from: string, to: string) {
  const periods: string[] = [];
  for (let period = from; period <= to; period = nextPeriod(period)) periods.push(period);
  return periods;
}
