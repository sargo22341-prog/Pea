import type { DividendProposal, DividendProposalAcceptInput } from "@pea/shared";
import { Coins, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../contexts/privacy-context";
import { usePullToRefreshSuspended } from "../../../hooks/usePullToRefreshSuspended";
import { cashMoney, localInputToIso } from "../../../lib/cash/cash-format";
import { toDateTimeLocalValue } from "../../../lib/dateTimeInput";
import { formatMaybeDate, formatNumber } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";
import { InfoHint } from "../disclosure/InfoHint";
import { MOTION } from "../motion";

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="muted">{label}</dt>
      <dd className="text-right font-medium text-slate-100">{children}</dd>
    </div>
  );
}

/**
 * Fenêtre de validation d'un dividende proposé : détail du calcul, solde espèces avant / après.
 * « Valider » enregistre le montant proposé, « Corriger » ouvre la saisie du montant et de la date
 * de crédit, « Ignorer » écarte la proposition (réversible depuis « Mon PEA »). Fermer la fenêtre
 * n'enregistre rien.
 */
export function DividendProposalDialog({ proposal, cash, onAccept, onIgnore, onClose }: {
  proposal: DividendProposal;
  cash: number;
  onAccept: (input: DividendProposalAcceptInput) => Promise<unknown>;
  onIgnore: () => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useTranslation(["cash", "common", "errors"]);
  const prive = usePrivacy();
  usePullToRefreshSuspended();
  const [correcting, setCorrecting] = useState(false);
  const [amount, setAmount] = useState(String(proposal.netAmount));
  const [creditedAt, setCreditedAt] = useState(toDateTimeLocalValue(proposal.paymentAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const correctedAmount = Number(amount);
  const credited = correcting && Number.isFinite(correctedAmount) ? correctedAmount : proposal.netAmount;
  const money = (value: number) => masquerValeur(cashMoney(value, proposal.currency), prive);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("keydown", closeOnEscape); };
  }, [onClose]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors:unknown"));
    } finally {
      setBusy(false);
    }
  }

  function accept() {
    if (!correcting) {
      void run(() => onAccept({}));
      return;
    }
    const effectiveAt = localInputToIso(creditedAt);
    if (!Number.isFinite(correctedAmount) || correctedAmount <= 0 || !effectiveAt) {
      setError(t("errors:numericInvalid"));
      return;
    }
    void run(() => onAccept({ amount: correctedAmount, effectiveAt }));
  }

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-end bg-black/60 p-4 sm:items-center sm:justify-center ${MOTION.overlay}`} onClick={onClose} role="presentation">
      <div aria-labelledby="dividend-proposal-title" aria-modal="true" className={`max-h-[92vh] w-full max-w-md overflow-y-auto rounded-lg border border-line bg-ink/95 shadow-glow backdrop-blur ${MOTION.dialog}`} onClick={(event) => { event.stopPropagation(); }} role="dialog">
        <div className="flex items-start gap-3 border-b border-line p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-mint/40 bg-mint/10 text-mint"><Coins size={20} /></div>
          <div className="min-w-0 flex-1">
            <p className="muted">{t("cash:proposals.dialogKicker")}</p>
            <h2 className="truncate text-base font-semibold" id="dividend-proposal-title">{proposal.symbol} · {proposal.name}</h2>
          </div>
          <button aria-label={t("common:actions.close")} className="btn-ghost shrink-0 px-2" onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <dl className="space-y-2 p-4 text-sm">
          <Row label={t("cash:proposals.exDividendAt")}>{formatMaybeDate(proposal.exDividendAt)}</Row>
          <Row label={t("cash:proposals.quantity")}>{formatNumber(proposal.quantity)}</Row>
          <Row label={t("cash:proposals.amountPerShare")}>{masquerValeur(`${formatNumber(proposal.amountPerShare)} ${proposal.currency}`, prive)}</Row>
          <Row label={t("cash:proposals.gross")}>{money(proposal.grossAmount)}</Row>
          <Row label={<>{t("cash:proposals.withholding", { rate: formatNumber(proposal.withholdingRate * 100) })} <InfoHint label={t("cash:proposals.withholdingInfo")}>{t("cash:hints.withholding")}</InfoHint></>}>
            -{money(proposal.withholdingAmount)}
          </Row>
          <Row label={<>{t("cash:proposals.net")} <InfoHint label={t("cash:proposals.calculationInfo")}>{t("cash:hints.dividendProposal")}</InfoHint></>}>{money(proposal.netAmount)}</Row>
          <Row label={t("cash:proposals.paymentAt")}>
            {formatMaybeDate(proposal.paymentAt)}{proposal.paymentEstimated ? ` (${t("cash:proposals.estimated")})` : ""}
          </Row>
          {proposal.needsReview ? <p className="rounded-md border border-amber/40 bg-amber/10 p-2 text-xs text-amber">{t("cash:proposals.needsReview")}</p> : null}
          {correcting ? (
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <label>
                <span className="muted mb-1 block">{t("cash:proposals.correctedAmount")}</span>
                <input className="input" min="0.01" onChange={(event) => { setAmount(event.target.value); }} required step="0.01" type="number" value={amount} />
              </label>
              <label>
                <span className="muted mb-1 block">{t("cash:proposals.creditedAt")}</span>
                <input className="input" onChange={(event) => { setCreditedAt(event.target.value); }} required type="datetime-local" value={creditedAt} />
              </label>
            </div>
          ) : null}
          <div className="border-t border-line pt-2">
            <Row label={t("cash:proposals.cashBefore")}>{money(cash)}</Row>
            <Row label={t("cash:proposals.cashAfter")}>{money(cash + credited)}</Row>
          </div>
          {error ? <p className="text-sm text-coral" role="alert">{error}</p> : null}
        </dl>
        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          <button className="btn-ghost sm:mr-auto" disabled={busy} onClick={onClose} type="button">{t("common:actions.cancel")}</button>
          <button className="btn-ghost" disabled={busy} onClick={() => void run(onIgnore)} type="button">{t("cash:proposals.ignore")}</button>
          {correcting ? null : <button className="btn-ghost" disabled={busy} onClick={() => { setCorrecting(true); }} type="button">{t("cash:proposals.correct")}</button>}
          <button className="btn-primary" disabled={busy} onClick={accept} type="button">{correcting ? t("cash:proposals.saveCorrection") : t("cash:proposals.accept")}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
