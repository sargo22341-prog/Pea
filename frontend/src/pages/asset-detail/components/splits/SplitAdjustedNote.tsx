import { useTranslation } from "react-i18next";
import { InfoHint } from "../../../../components/common/disclosure/InfoHint";
import { money } from "../../../../lib/format";
import { formatRatio } from "../../../../lib/format-metrics";

/**
 * Mention « ajusté ×10 » d'une transaction antérieure à une division validée : la saisie reste
 * modifiable telle quelle, l'infobulle montre comment elle est lue dans les calculs.
 */
export function SplitAdjustedNote({ factor, quantity, price, currency }: { factor: number; quantity: number; price: number; currency: string }) {
  const { t } = useTranslation("asset");
  const label = t("splits.adjustedBadge", { factor: formatRatio(factor, 4) });

  return (
    <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber">
      {label}
      <InfoHint label={label}>
        {t("splits.adjustedHint", { quantity: formatRatio(quantity * factor, 6), price: money(price / factor, currency) })}
      </InfoHint>
    </span>
  );
}
