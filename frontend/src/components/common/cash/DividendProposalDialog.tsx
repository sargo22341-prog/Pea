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
import { DividendCorrectionFields } from "./DividendCorrectionFields";
import { DividendIsinField } from "./DividendIsinField";
import { DividendVerificationPanel } from "./verification/DividendVerificationPanel";
import type { DividendProposalsState } from "./useDividendProposals";

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="muted">{label}</dt>
      <dd className="text-right font-medium text-slate-100">{children}</dd>
    </div>
  );
}

/**
 * Fenêtre d'un dividende : détail du calcul et solde espèces avant / après. À confirmer :
 * « Valider » enregistre le montant proposé, « Corriger » ouvre la saisie, « Ignorer » l'écarte
 * (réversible depuis « Mon PEA »). Déjà enregistré (à la main ou automatiquement) : la correction
 * modifie directement le mouvement. Fermer la fenêtre n'enregistre rien.
 */
export function DividendProposalDialog({ proposal, proposals, onClose }: { proposal: DividendProposal; proposals: DividendProposalsState; onClose: () => void }) {
  const { t } = useTranslation(["cash", "common", "errors"]);
  const prive = usePrivacy();
  usePullToRefreshSuspended();
  const recorded = proposal.status === "accepted";
  const certified = proposal.verification?.status === "document";
  const positionId = proposal.positionId;
  const recordedAmount = proposal.creditedAmount ?? proposal.netAmount;
  const [correcting, setCorrecting] = useState(recorded);
  const [amount, setAmount] = useState(String(recordedAmount));
  const [creditedAt, setCreditedAt] = useState(toDateTimeLocalValue(proposal.creditedAt ?? proposal.paymentAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const correctedAmount = Number(amount);
  const credited = correcting && Number.isFinite(correctedAmount) ? correctedAmount : proposal.netAmount;
  // Un dividende enregistré est déjà dans le solde : seul l'écart de la correction le modifie.
  const cashBefore = recorded ? proposals.cash - recordedAmount : proposals.cash;
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

  function save() {
    if (!correcting) {
      void run(() => proposals.accept(proposal.id, {}));
      return;
    }
    const effectiveAt = localInputToIso(creditedAt);
    if (!Number.isFinite(correctedAmount) || correctedAmount <= 0 || !effectiveAt) {
      setError(t("errors:numericInvalid"));
      return;
    }
    // L'avertissement est affiché au-dessus de la saisie : enregistrer vaut confirmation.
    const input: DividendProposalAcceptInput = { amount: correctedAmount, effectiveAt, ...(certified ? { confirmUncertify: true } : {}) };
    void run(() => (recorded ? proposals.correct(proposal.id, input) : proposals.accept(proposal.id, input)));
  }

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-end bg-black/60 p-4 sm:items-center sm:justify-center ${MOTION.overlay}`} onClick={onClose} role="presentation">
      <div aria-labelledby="dividend-proposal-title" aria-modal="true" className={`max-h-[92vh] w-full max-w-md overflow-y-auto rounded-lg border border-line bg-ink/95 shadow-glow backdrop-blur ${MOTION.dialog}`} onClick={(event) => { event.stopPropagation(); }} role="dialog">
        <div className="flex items-start gap-3 border-b border-line p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-mint/40 bg-mint/10 text-mint"><Coins size={20} /></div>
          <div className="min-w-0 flex-1">
            <p className="muted">{t(recorded ? "cash:proposals.recordedKicker" : "cash:proposals.dialogKicker")}</p>
            <h2 className="truncate text-base font-semibold" id="dividend-proposal-title">{proposal.symbol} · {proposal.name}</h2>
          </div>
          <button aria-label={t("common:actions.close")} className="btn-ghost shrink-0 px-2" onClick={onClose} type="button"><X size={16} /></button>
        </div>
        <dl className="space-y-2 p-4 text-sm">
          {proposal.autoAccepted ? <p className="rounded-md border border-mint/40 bg-mint/10 p-2 text-xs text-mint">{t("cash:proposals.autoAcceptedNotice", { date: formatMaybeDate(proposal.decidedAt) })}</p> : null}
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
          {recorded ? <Row label={t("cash:proposals.recordedAmount")}>{money(recordedAmount)}</Row> : null}
          {proposal.needsReview && !recorded ? <p className="rounded-md border border-amber/40 bg-amber/10 p-2 text-xs text-amber">{t("cash:proposals.needsReview")}</p> : null}
          {!recorded && proposal.withholdingBasis !== "isin" && positionId !== undefined ? (
            <DividendIsinField onSave={(isin) => proposals.setIsin(positionId, isin)} />
          ) : null}
          {correcting ? <DividendCorrectionFields amount={amount} certified={certified} creditedAt={creditedAt} onAmount={setAmount} onCreditedAt={setCreditedAt} /> : null}
          {recorded && proposal.movementId !== undefined ? <DividendVerificationPanel movementId={proposal.movementId} verification={proposal.verification} /> : null}
          <div className="border-t border-line pt-2">
            <Row label={t("cash:proposals.cashBefore")}>{money(cashBefore)}</Row>
            <Row label={t("cash:proposals.cashAfter")}>{money(cashBefore + credited)}</Row>
          </div>
          {error ? <p className="text-sm text-coral" role="alert">{error}</p> : null}
        </dl>
        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          <button className="btn-ghost sm:mr-auto" disabled={busy} onClick={onClose} type="button">{t("common:actions.cancel")}</button>
          {recorded ? null : <button className="btn-ghost" disabled={busy} onClick={() => void run(() => proposals.ignore(proposal.id))} type="button">{t("cash:proposals.ignore")}</button>}
          {correcting ? null : <button className="btn-ghost" disabled={busy} onClick={() => { setCorrecting(true); }} type="button">{t("cash:proposals.correct")}</button>}
          <button className="btn-primary" disabled={busy} onClick={save} type="button">{correcting ? t("cash:proposals.saveCorrection") : t("cash:proposals.accept")}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Fenêtre de la proposition sélectionnée, relue dans l'état courant : un ISIN saisi ou un ajout
 * automatique la met à jour, et un changement de statut la réinitialise.
 */
export function SelectedDividendDialog({ selectedId, proposals, onClose }: { selectedId: number | null; proposals: DividendProposalsState; onClose: () => void }) {
  const proposal = selectedId === null ? undefined : proposals.find(selectedId);
  if (!proposal) return null;
  return <DividendProposalDialog key={`${proposal.id}:${proposal.status}`} onClose={onClose} proposal={proposal} proposals={proposals} />;
}
