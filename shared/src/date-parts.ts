/** Composantes numeriques d'une date civile `YYYY-MM-DD` ; une composante absente vaut NaN. */
export function parseIsoDateParts(isoDate: string): [year: number, month: number, day: number] {
  const [year = Number.NaN, month = Number.NaN, day = Number.NaN] = isoDate.split("-").map(Number);
  return [year, month, day];
}

/** Composantes numeriques d'un horaire `HH:mm` ; une composante absente vaut NaN. */
export function parseTimeParts(time: string): [hour: number, minute: number] {
  const [hour = Number.NaN, minute = Number.NaN] = time.split(":").map(Number);
  return [hour, minute];
}
