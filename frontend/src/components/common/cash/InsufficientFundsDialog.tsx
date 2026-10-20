import type { InsufficientFundsDetails } from "@pea/shared";
import { Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { usePullToRefreshSuspended } from "../../../hooks/usePullToRefreshSuspended";
import { cashMoney } from "../../../lib/cash/cash-format";
import { formatMaybeDate } from "../../../lib/format";
import { MOTION } from "../motion";

/**
 * Fonds insuffisants pour une opération : propose d'enregistrer un versement déjà effectué mais
 * pas encore saisi, prérempli avec le montant manquant. Aucun versement n'est créé sans clic sur
 * « Confirmer » ; le backend enregistre alors versement et opération dans une même transaction.
 */
export function InsufficientFundsDialog({
  details,
  busy,
  error,
  onCancel,
  onConfirm
}: {
  details: InsufficientFundsDetails;
  busy: boolean;
  error?: string | null | undefined;
  onCancel: () => void;
  onConfirm: (amount: number) => void;
}) {
  const { t } = useTranslation(["cash", "common"]);
  usePullToRefreshSuspended();
  const [amount, setAmount] = useState(String(details.shortfall));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); };
  }, [onCancel]);

  function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < details.shortfall) {
      setLocalError(t("cash:funding.amountTooLow", { amount: cashMoney(details.shortfall) }));
      return;
    }
    setLocalError(null);
    onConfirm(value);
  }

  return createPortal(
    <div className={`fixed inset-0 z-[70] flex items-end bg-black/60 p-4 sm:items-center sm:justify-center ${MOTION.overlay}`} onClick={onCancel} role="presentation">
      <div aria-labelledby="insufficient-funds-title" aria-modal="true" className={`w-full max-w-md overflow-hidden rounded-lg border border-line bg-ink/95 shadow-glow backdrop-blur ${MOTION.dialog}`} onClick={(event) => { event.stopPropagation(); }} role="dialog">
        <div className="flex items-start gap-3 border-b border-line p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber/40 bg-amber/10 text-amber">
            <Wallet size={20} />
          </div>
          <h3 className="min-w-0 flex-1 text-base font-semibold" id="insufficient-funds-title">{t("cash:funding.title")}</h3>
          <button aria-label={t("common:actions.close")} className="btn-ghost shrink-0 px-2" onClick={onCancel} type="button"><X size={16} /></button>
        </div>
        <div className="space-y-3 p-4 text-sm">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt className="muted">{t("cash:funding.available")}</dt>
            <dd className="text-right font-semibold" data-testid="funding-available">{cashMoney(details.available)}</dd>
            <dt className="muted">{t("cash:funding.required")}</dt>
            <dd className="text-right font-semibold">{cashMoney(details.required)}</dd>
            <dt className="muted">{t("cash:funding.shortfall")}</dt>
            <dd className="text-right font-semibold text-coral" data-testid="funding-shortfall">{cashMoney(details.shortfall)}</dd>
          </dl>
          {details.fundable ? (
            <>
              <p className="leading-6 text-slate-300">{t("cash:funding.question")}</p>
              <label className="block">
                <span className="muted mb-1 block">{t("cash:funding.amount")}</span>
                <input aria-label={t("cash:funding.amount")} className="input" min={details.shortfall} onChange={(event) => { setAmount(event.target.value); }} step="0.01" type="number" value={amount} />
              </label>
              <p className="muted text-xs">{t("cash:funding.dateNote", { date: formatMaybeDate(details.effectiveAt) })}</p>
            </>
          ) : (
            <p className="leading-6 text-slate-300">{t("cash:funding.notFundable")}</p>
          )}
          {localError ?? error ? <p className="rounded-md border border-coral/40 bg-coral/10 p-2 text-coral">{localError ?? error}</p> : null}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          <button className="btn-ghost" onClick={onCancel} type="button">{t("cash:funding.cancel")}</button>
          {details.fundable ? (
            <button className="btn-primary" disabled={busy} onClick={submit} type="button">{t("cash:funding.confirm")}</button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
