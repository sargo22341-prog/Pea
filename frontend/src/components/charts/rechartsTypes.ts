/**
 * Helpers de typage pour les payloads Recharts.
 *
 * Recharts n'expose pas de types stricts pour `Tooltip`/`payload`/`dataKey` — la lib type
 * tout en `unknown` ou en `string | number | function`. On centralise ici les type guards
 * qui valident à l'entrée du tooltip pour ne pas laisser fuiter de `as ChartTooltipPayload`
 * cast brut dans les composants charts.
 */

export interface ChartTooltipEntry {
  dataKey?: string | number | ((obj: unknown) => unknown);
  name?: string | number;
  payload?: unknown;
  value?: unknown;
  color?: string;
}

export type ChartTooltipPayload = ReadonlyArray<ChartTooltipEntry>;

/**
 * Type guard : vérifie qu'une valeur Recharts (`props.payload` ou cast unknown) est bien un
 * tableau de payload entries. Retourne un tableau vide si invalide pour éviter tout crash
 * au rendu.
 */
export function asChartTooltipPayload(value: unknown): ChartTooltipPayload {
  if (!Array.isArray(value)) return [];
  return value.filter(isChartTooltipEntry);
}

function isChartTooltipEntry(item: unknown): item is ChartTooltipEntry {
  return Boolean(item) && typeof item === "object";
}

/**
 * Convertit la valeur d'une entrée tooltip en number fini, ou retourne undefined.
 * Recharts envoie souvent des `string | number | undefined` qu'il faut normaliser avant
 * d'appeler `Number.isFinite`.
 */
export function tooltipNumberValue(value: unknown): number | undefined {
  if (value == null) return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

/**
 * Récupère le label Recharts (`props.label`) en tant que `string | number`.
 * Utile pour les `labelFormatter` qui reçoivent un `unknown` mal typé.
 */
export function tooltipLabel(value: unknown): string | number {
  if (typeof value === "number" || typeof value === "string") return value;
  return "";
}
