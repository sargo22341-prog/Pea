import { isMeaningfulMultiple, type AssetValuation } from "@pea/shared";
import type { TFunction } from "i18next";
import type { MetricItem } from "../../../../components/common/metrics/metric-items";
import { money } from "../../../../lib/format";
import { formatCompactMoney, formatCompactNumber, formatRatio } from "../../../../lib/format-metrics";

/** Multiple affiché « n.s. » (non significatif) quand il est négatif ou nul. */
function multiple(value: number | undefined, t: TFunction<"asset">) {
  if (value === undefined) return undefined;
  return isMeaningfulMultiple(value) ? formatRatio(value, 1) : t("valuation.notMeaningful");
}

function hint(key: string, t: TFunction<"asset">) {
  return t(`valuation.${key}Hint`);
}

/** Niveau 1 : les quatre repères que tout investisseur regarde en premier. */
export function primaryValuationItems(valuation: AssetValuation, t: TFunction<"asset">): MetricItem[] {
  const currency = valuation.currency ?? "EUR";
  return [
    {
      key: "trailingPE",
      label: t("valuation.trailingPE"),
      value: multiple(valuation.trailingPE, t),
      hint: hint("trailingPE", t),
      sub: valuation.forwardPE === undefined ? undefined : t("valuation.forwardPE", { value: multiple(valuation.forwardPE, t) })
    },
    { key: "priceToBook", label: t("valuation.priceToBook"), value: multiple(valuation.priceToBook, t), hint: hint("priceToBook", t) },
    {
      key: "trailingEps",
      label: t("valuation.trailingEps"),
      value: valuation.trailingEps === undefined ? undefined : money(valuation.trailingEps, currency),
      hint: hint("trailingEps", t),
      sub: valuation.forwardEps === undefined ? undefined : t("valuation.forwardEps", { value: money(valuation.forwardEps, currency) })
    },
    { key: "marketCap", label: t("valuation.marketCap"), value: valuation.marketCap === undefined ? undefined : formatCompactMoney(valuation.marketCap, currency), hint: hint("marketCap", t) }
  ];
}

/** Niveau 2 : ratios complémentaires derrière « Plus de ratios ». */
export function secondaryValuationItems(valuation: AssetValuation, t: TFunction<"asset">): MetricItem[] {
  const currency = valuation.currency ?? "EUR";
  return [
    { key: "priceToSales", label: t("valuation.priceToSales"), value: multiple(valuation.priceToSales, t), hint: hint("priceToSales", t) },
    { key: "enterpriseValue", label: t("valuation.enterpriseValue"), value: valuation.enterpriseValue === undefined ? undefined : formatCompactMoney(valuation.enterpriseValue, currency), hint: hint("enterpriseValue", t) },
    { key: "enterpriseToEbitda", label: t("valuation.enterpriseToEbitda"), value: multiple(valuation.enterpriseToEbitda, t), hint: hint("enterpriseToEbitda", t) },
    { key: "beta", label: t("valuation.beta"), value: valuation.beta === undefined ? undefined : formatRatio(valuation.beta), hint: hint("beta", t) },
    { key: "floatShares", label: t("valuation.floatShares"), value: valuation.floatShares === undefined ? undefined : formatCompactNumber(valuation.floatShares), hint: hint("floatShares", t) }
  ];
}
