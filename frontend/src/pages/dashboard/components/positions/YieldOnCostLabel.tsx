import { useTranslation } from "react-i18next";
import { formatFractionPercent } from "../../../../lib/format-metrics";
import { masquerValeur } from "../../../../lib/privacy";

/** Rendement sur coût d'une ligne, à la suite de la quantité ; masqué en mode privé, absent sans dividende connu. */
export function YieldOnCostLabel({ value, prive }: { value: number | undefined; prive: boolean }) {
  const { t } = useTranslation("dashboard");
  if (value === undefined || value <= 0) return null;
  const formatted = masquerValeur(formatFractionPercent(value), prive);
  return (
    <span className="whitespace-nowrap" title={t("positionSignals.yieldOnCostHint")}>
      {" · "}
      {t("positionSignals.yieldOnCost", { value: formatted })}
    </span>
  );
}
