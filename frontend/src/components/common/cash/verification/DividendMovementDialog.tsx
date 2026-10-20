import type { CashLedgerDto, CashLedgerEntry } from "@pea/shared";
import { Coins, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../../contexts/privacy-context";
import { usePullToRefreshSuspended } from "../../../../hooks/usePullToRefreshSuspended";
import { api } from "../../../../lib/api";
import { cashMoney, localInputToIso } from "../../../../lib/cash/cash-format";
import { movementIdOf } from "../../../../lib/cash/ledger-entry";
import { toDateTimeLocalValue } from "../../../../lib/dateTimeInput";
import { formatChartDateTime } from "../../../../lib/format";
import { masquerValeur } from "../../../../lib/privacy";
import { MOTION } from "../../motion";
import { DividendCorrectionFields } from "../DividendCorrectionFields";
import { notifyDividendsChanged } from "../useDividendProposals";
import { DividendVerificationPanel } from "./DividendVerificationPanel";

/**
 * Fenêtre d'un dividende encaissé du journal (saisi, validé ou importé d'un relevé) : montant,
 * date, vérification, et correction directe du mouvement. Fermer la fenêtre n'enregistre rien.
 */
export function DividendMovementDialog({ entry, onClose, onChanged }: { entry: CashLedgerEntry; onClose: () => void; onChanged?: ((ledger: CashLedgerDto) => void) | undefined }) {
  const { t } = useTranslation(["cash", "common", "errors"]);
  const prive = usePrivacy();
  usePullToRefreshSuspended();
  const movementId = movementIdOf(entry);
  const certified = entry.verification?.status === "document";
  const [correcting, setCorrecting] = useState(false);
  const [amount, setAmount] = useState(String(entry.amount));
  const [creditedAt, setCreditedAt] = useState(toDateTimeLocalValue(entry.effectiveAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);

  if (movementId === undefined) return null;

  async function save(id: number) {
    const value = Number(amount);
    const effectiveAt = localInputToIso(creditedAt);
    if (!Number.isFinite(value) || value <= 0 || !effectiveAt) {
      setError(t("errors:numericInvalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // L'avertissement est affiché au-dessus de la saisie : enregistrer vaut confirmation.
      onChanged?.(await api.correctDividend(id, { amount: value, effectiveAt, ...(certified ? { confirmUncertify: true } : {}) }));
      notifyDividendsChanged();
      setCorrecting(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors:unknown"));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-end bg-black/60 p-4 sm:items-center sm:justify-center ${MOTION.overlay}`} onClick={onClose} role="presentation">
      <div aria-labelledby="dividend-movement-title" aria-modal="true" className={`max-h-[92vh] w-full max-w-md overflow-y-auto rounded-lg border border-line bg-ink/95 shadow-glow backdrop-blur ${MOTION.dialog}`} onClick={(event) => { event.stopPropagation(); }} role="dialog">
        <div className="flex items-start gap-3 border-b border-line p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-mint/40 bg-mint/10 text-mint"><Coins size={20} /></div>
          <div className="min-w-0 flex-1">
            <p className="muted">{t("cash:verification.dialogKicker")}</p>
            <h2 className="truncate text-base font-semibold" id="dividend-movement-title">{[entry.symbol, entry.name].filter(Boolean).join(" · ") || t("cash:kinds.dividend")}</h2>
          </div>
          <button aria-label={t("common:actions.close")} className="btn-ghost shrink-0 px-2" onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <div className="space-y-2 p-4 text-sm">
          <p className="flex justify-between gap-3"><span className="muted">{t("cash:verification.amount")}</span><span className="font-medium">{masquerValeur(cashMoney(entry.amount), prive)}</span></p>
          <p className="flex justify-between gap-3"><span className="muted">{t("cash:verification.date")}</span><span className="font-medium">{formatChartDateTime(entry.effectiveAt)}</span></p>
          {correcting ? <DividendCorrectionFields amount={amount} certified={certified} creditedAt={creditedAt} onAmount={setAmount} onCreditedAt={setCreditedAt} /> : null}
          <DividendVerificationPanel movementId={movementId} onChanged={onChanged} verification={entry.verification} />
          {error ? <p className="text-sm text-coral" role="alert">{error}</p> : null}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          <button className="btn-ghost sm:mr-auto" disabled={busy} onClick={onClose} type="button">{t("common:actions.close")}</button>
          {correcting
            ? <button className="btn-primary" disabled={busy} onClick={() => void save(movementId)} type="button">{t("cash:proposals.saveCorrection")}</button>
            : <button className="btn-ghost" disabled={busy} onClick={() => { setCorrecting(true); }} type="button">{t("cash:proposals.correct")}</button>}
        </div>
      </div>
    </div>,
    document.body
  );
}
