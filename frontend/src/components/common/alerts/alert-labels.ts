import type { AlertEvent, AlertParams, AlertType } from "@pea/shared";
import type { TFunction } from "i18next";
import { formatMaybeDate, money } from "../../../lib/format";
import { recommendationLabelKey } from "../../../utils/assetTone";

/** Condition d'une alerte, lisible : « Cours au-dessus de 60,00 € ». */
export function describeAlert(type: AlertType, params: AlertParams, currency: string, t: TFunction) {
  const threshold = params.threshold;
  switch (type) {
    case "price_above":
    case "price_below":
      return t(`alerts:describe.${type}`, { value: threshold === undefined ? "" : money(threshold, currency) });
    case "daily_change":
      return t("alerts:describe.daily_change", { value: threshold ?? "" });
    case "ma200_cross":
      return t(`alerts:describe.ma200_cross_${params.direction ?? "both"}`);
    default:
      return t(`alerts:describe.${type}`);
  }
}

/** Ce qui s'est produit, avec les valeurs figées au déclenchement. */
export function describeEvent(event: AlertEvent, t: TFunction) {
  const { payload } = event;
  const currency = payload.currency ?? "EUR";
  const price = payload.price === undefined ? "" : money(payload.price, currency);
  switch (event.type) {
    case "price_above":
    case "price_below":
      return t(`alerts:events.${event.type}`, { price, threshold: payload.threshold === undefined ? "" : money(payload.threshold, currency) });
    case "daily_change":
      return t("alerts:events.daily_change", { change: payload.changePercent?.toFixed(2) ?? "" });
    case "ma200_cross":
      return t(`alerts:events.ma200_cross_${payload.crossed ?? "up"}`, { price });
    case "new_52w_high":
    case "new_52w_low":
      return t(`alerts:events.${event.type}`, { price });
    case "recommendation_change":
      return t("alerts:events.recommendation_change", {
        from: payload.previousKey ? t(`asset:${recommendationLabelKey(payload.previousKey)}`) : "",
        to: payload.recommendationKey ? t(`asset:${recommendationLabelKey(payload.recommendationKey)}`) : ""
      });
    case "ex_dividend_announced":
      return t("alerts:events.ex_dividend_announced", { date: formatMaybeDate(payload.exDividendDate, "UTC") });
  }
}
