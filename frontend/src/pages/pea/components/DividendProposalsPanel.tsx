import type { DividendProposal } from "@pea/shared";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SelectedDividendDialog } from "../../../components/common/cash/DividendProposalDialog";
import type { DividendProposalsState } from "../../../components/common/cash/useDividendProposals";
import { InfoHint } from "../../../components/common/disclosure/InfoHint";
import { Collapsible } from "../../../components/common/feedback/Collapsible";
import { usePrivacy } from "../../../contexts/privacy-context";
import { cashMoney } from "../../../lib/cash/cash-format";
import { formatMaybeDate } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";

function ProposalLine({ proposal, prive, children }: { proposal: DividendProposal; prive: boolean; children: ReactNode }) {
  const { t } = useTranslation("cash");
  return (
    <li className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="truncate font-semibold">{proposal.symbol} · {proposal.name}</p>
        <p className="muted text-xs">
          {proposal.status === "accepted"
            ? t(proposal.autoAccepted ? "proposals.lineAuto" : "proposals.lineRecorded", { amount: masquerValeur(cashMoney(proposal.creditedAmount ?? proposal.netAmount, proposal.currency), prive), date: formatMaybeDate(proposal.creditedAt ?? proposal.paymentAt) })
            : t("proposals.line", { amount: masquerValeur(cashMoney(proposal.netAmount, proposal.currency), prive), date: formatMaybeDate(proposal.paymentAt) })}
          {proposal.needsReview && proposal.status === "pending" ? ` · ${t("proposals.toVerify")}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </li>
  );
}

/**
 * Dividendes proposés dans « Mon PEA » : en attente (à valider, corriger ou ignorer), enregistrés
 * récemment (corrigeables) et ignorés (réactivables). Masqué tant qu'il n'y a rien à afficher.
 */
export function DividendProposalsPanel({ proposals }: { proposals: DividendProposalsState }) {
  const { t } = useTranslation(["cash", "errors"]);
  const prive = usePrivacy();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!proposals.pending.length && !proposals.ignored.length && !proposals.recent.length) return null;

  async function restore(id: number) {
    setError(null);
    try {
      await proposals.restore(id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors:unknown"));
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <div>
        <h2 className="font-semibold">
          {t("cash:proposals.title")} <InfoHint label={t("cash:proposals.calculationInfo")}>{t("cash:hints.dividendProposal")}</InfoHint>
        </h2>
        <p className="muted text-sm">{t("cash:proposals.description")}</p>
      </div>
      {proposals.pending.length ? (
        <ul className="divide-y divide-line">
          {proposals.pending.map((proposal) => (
            <ProposalLine key={proposal.id} prive={prive} proposal={proposal}>
              <button className="btn-primary" onClick={() => { setSelectedId(proposal.id); }} type="button">{t("cash:proposals.review")}</button>
            </ProposalLine>
          ))}
        </ul>
      ) : <p className="muted text-sm">{t("cash:proposals.nonePending")}</p>}
      {proposals.recent.length ? (
        <Collapsible title={t("cash:proposals.recentTitle", { count: proposals.recent.length })}>
          <ul className="divide-y divide-line">
            {proposals.recent.map((proposal) => (
              <ProposalLine key={proposal.id} prive={prive} proposal={proposal}>
                <button className="btn-ghost" onClick={() => { setSelectedId(proposal.id); }} type="button">{t("cash:proposals.correct")}</button>
              </ProposalLine>
            ))}
          </ul>
        </Collapsible>
      ) : null}
      {proposals.ignored.length ? (
        <Collapsible title={t("cash:proposals.ignoredTitle", { count: proposals.ignored.length })}>
          <ul className="divide-y divide-line">
            {proposals.ignored.map((proposal) => (
              <ProposalLine key={proposal.id} prive={prive} proposal={proposal}>
                <button className="btn-ghost" onClick={() => void restore(proposal.id)} type="button">{t("cash:proposals.restore")}</button>
              </ProposalLine>
            ))}
          </ul>
        </Collapsible>
      ) : null}
      {error ?? proposals.error ? <p className="text-sm text-coral" role="alert">{error ?? proposals.error}</p> : null}
      <SelectedDividendDialog onClose={() => { setSelectedId(null); }} proposals={proposals} selectedId={selectedId} />
    </section>
  );
}
