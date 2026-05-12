/**
 * Role du fichier : centraliser les petits types partages par les composants
 * du Dashboard pour eviter de recopier les signatures de callbacks.
 */

import type { RangeKey } from "@pea/shared";

export type DashboardRangeSetter = (source: string, nextRange: RangeKey) => void;
