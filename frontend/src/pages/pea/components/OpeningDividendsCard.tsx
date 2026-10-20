import { useState } from "react";
import { useTranslation } from "react-i18next";
import { OpeningDividendsStep } from "../../../components/common/cash/OpeningDividendsStep";
import { DividendVerificationBadge } from "../../../components/common/cash/verification/DividendVerificationBadge";
import { usePrivacy } from "../../../contexts/privacy-context";
import { cashMoney } from "../../../lib/cash/cash-format";
import { formatMaybeDate } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";

/**
 * Dividendes perçus avant l'état initial, dans « Mon PEA » : formulaire ouvert juste après la
 * configuration du compte, puis résumé du montant confirmé avec « Modifier », ou rappel tant
 * qu'aucun montant n'est confirmé.
 */
export function OpeningDividendsCard({ referenceAt, declared, certifiedAt, startEditing, onSaved }: {
  referenceAt: string;
  declared: number | undefined;
  /** Montant certifié par des relevés de coupons ; une modification manuelle retire la certification. */
  certifiedAt?: string | undefined;
  startEditing: boolean;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const [editing, setEditing] = useState(startEditing);

  if (editing) {
    return (
      <section className="card p-4">
        <OpeningDividendsStep
          onDone={async (saved) => {
            setEditing(false);
            if (saved) await onSaved();
          }}
          skipLabel={t("openingDividends.cancel")}
        />
      </section>
    );
  }

  return (
    <section className={`card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ${declared === undefined ? "border-amber/40" : ""}`}>
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          {t("openingDividends.title")}
          {certifiedAt && declared !== undefined ? <DividendVerificationBadge verification={{ status: "document", verifiedAt: certifiedAt }} /> : null}
        </h2>
        <p className="muted text-sm">
          {declared === undefined
            ? t("openingDividends.notConfirmed", { date: formatMaybeDate(referenceAt) })
            : t("openingDividends.confirmed", { amount: masquerValeur(cashMoney(declared), prive), date: formatMaybeDate(referenceAt) })}
        </p>
      </div>
      <button className={declared === undefined ? "btn-primary" : "btn-ghost"} onClick={() => { setEditing(true); }} type="button">
        {declared === undefined ? t("openingDividends.calculate") : t("openingDividends.edit")}
      </button>
    </section>
  );
}
