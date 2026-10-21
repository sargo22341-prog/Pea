import { useTranslation } from "react-i18next";

/**
 * Saisie d'une correction de dividende (montant net crédité, date de crédit). Un dividende
 * certifié par relevé de coupons ou vérifié par relevé espèces affiche l'avertissement :
 * enregistrer la correction retire la certification ou la vérification.
 */
export function DividendCorrectionFields({ amount, creditedAt, certified = false, cashVerified = false, onAmount, onCreditedAt }: { amount: string; creditedAt: string; certified?: boolean; cashVerified?: boolean; onAmount: (value: string) => void; onCreditedAt: (value: string) => void }) {
  const { t } = useTranslation("cash");
  return (
    <div className="space-y-2 pt-2">
      {certified ? <p className="rounded-md border border-amber/40 bg-amber/10 p-2 text-xs text-amber" role="alert">{t("verification.uncertifyWarning")}</p> : null}
      {cashVerified ? <p className="rounded-md border border-amber/40 bg-amber/10 p-2 text-xs text-amber" role="alert">{t("cashStatements.unverifyWarning")}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="muted mb-1 block">{t("proposals.correctedAmount")}</span>
          <input className="input" min="0.01" onChange={(event) => { onAmount(event.target.value); }} required step="0.01" type="number" value={amount} />
        </label>
        <label>
          <span className="muted mb-1 block">{t("proposals.creditedAt")}</span>
          <input className="input" onChange={(event) => { onCreditedAt(event.target.value); }} required type="datetime-local" value={creditedAt} />
        </label>
      </div>
    </div>
  );
}
