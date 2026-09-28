import type { UserAssetSplit } from "@pea/shared";
import type { TFunction } from "i18next";
import { formatRatio } from "./format-metrics";

/** Libellé d'une division : « 1 → 10 (division) » ou « 10 → 1 (regroupement) ». */
export function splitRatioLabel(split: Pick<UserAssetSplit, "numerator" | "denominator">, t: TFunction<"asset">) {
  return t(split.numerator >= split.denominator ? "splits.division" : "splits.reverse", {
    from: formatRatio(split.denominator),
    to: formatRatio(split.numerator)
  });
}
