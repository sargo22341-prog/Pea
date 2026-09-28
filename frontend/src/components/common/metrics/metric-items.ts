import type { ReactNode } from "react";
import type { IconTone, InfoTone } from "../../../utils/assetTone";

export interface MetricItem {
  key: string;
  label: string;
  /** `undefined` : indicateur absent, la tuile n'est pas affichée. */
  value: ReactNode;
  icon?: ReactNode;
  iconTone?: IconTone;
  tone?: InfoTone | undefined;
  /** Explication de niveau 3 affichée derrière une icône ⓘ. */
  hint?: string | undefined;
  sub?: ReactNode;
}

/** Nombre minimal d'indicateurs pour qu'un bloc vaille la peine d'être affiché (règle « pas de carte vide »). */
export const METRIC_GRID_MIN_VISIBLE = 2;

export function visibleMetrics(items: MetricItem[]) {
  return items.filter((item) => item.value !== undefined && item.value !== null);
}
