import type { CashLedgerDto } from "@pea/shared";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { InitialStateForm } from "../../components/common/cash/InitialStateForm";
import { OpeningDividendsStep } from "../../components/common/cash/OpeningDividendsStep";
import { DIVIDEND_PROPOSALS_CHANGED_EVENT, useDividendProposals } from "../../components/common/cash/useDividendProposals";
import { Collapsible } from "../../components/common/feedback/Collapsible";
import { MOTION } from "../../components/common/motion";
import { useAsync } from "../../hooks/useAsync";
import { api } from "../../lib/api";
import { CashMovementForm } from "./components/CashMovementForm";
import { DividendProposalsPanel } from "./components/DividendProposalsPanel";
import { LedgerTable } from "./components/LedgerTable";
import { PeaOverviewCards } from "./components/PeaOverviewCards";
import { useCashLedger } from "./hooks/useCashLedger";

/** Plage de la synthèse : seule la valorisation courante est utile ici (même cache que l'accueil en 1j). */
const summaryRange = "1d";

/** Mon PEA : détail du compte (valeur, versements, performance), mouvements espèces et état initial. */
export function MyPeaPage() {
  const { t } = useTranslation(["cash", "common"]);
  const ledger = useCashLedger();
  const portfolio = useAsync((signal) => api.portfolioFull(summaryRange, signal), summaryRange, { cacheKey: `portfolio-full:${summaryRange}` });
  const reloadPortfolio = portfolio.reload;
  const proposals = useDividendProposals();
  const reloadLedger = ledger.reload;

  // Un dividende validé (ici ou depuis la cloche) crédite les espèces : journal et synthèse sont relus.
  useEffect(() => {
    const onChanged = () => { void Promise.all([reloadLedger(), reloadPortfolio()]); };
    window.addEventListener(DIVIDEND_PROPOSALS_CHANGED_EVENT, onChanged);
    return () => { window.removeEventListener(DIVIDEND_PROPOSALS_CHANGED_EVENT, onChanged); };
  }, [reloadLedger, reloadPortfolio]);

  useEffect(() => {
    document.title = `${t("cash:page.title")} | PEA Portfolio`;
    return () => { document.title = "PEA Portfolio"; };
  }, [t]);

  if (ledger.error) return <div className="card border-coral p-6 text-coral">{ledger.error}</div>;
  if (ledger.loading || !ledger.data) return <div className="p-6 text-slate-400">{t("common:common.loading")}</div>;
  const { summary, settings } = ledger.data;
  const pending = summary.status === "pending";

  // Une écriture renvoie le journal à jour ; la synthèse (valeur, gain) est relue en parallèle.
  function ledgerChanged(next: CashLedgerDto) {
    ledger.replace(next);
    void reloadPortfolio();
  }

  async function initialStateSaved() {
    await Promise.all([ledger.reload(), reloadPortfolio()]);
  }

  const initialState = <InitialStateForm key={settings.updatedAt ?? "initial"} onSaved={initialStateSaved} settings={settings} submitLabel={t("cash:setup.save")} />;

  return (
    <div className={`space-y-6 ${MOTION.stagger}`}>
      <div>
        <h1 className="text-2xl font-bold">{t("cash:page.title")}</h1>
        <p className="muted">{t("cash:page.subtitle")}</p>
      </div>

      {portfolio.data ? <PeaOverviewCards summary={portfolio.data.summary} /> : null}

      {pending ? (
        <section className="card space-y-3 border-amber/40 p-4">
          <div>
            <h2 className="font-semibold">{t("cash:pending.title")}</h2>
            <p className="muted">{t("cash:setup.missing")}</p>
          </div>
          {initialState}
        </section>
      ) : (
        <>
          <DividendProposalsPanel proposals={proposals} />
          <CashMovementForm assets={ledger.assets} onSaved={ledgerChanged} summary={summary} />
        </>
      )}

      <LedgerTable ledger={ledger.data} onChanged={ledgerChanged} />

      {pending ? null : (
        <Collapsible title={t("cash:setup.editTitle")}>
          <p className="muted text-sm">{t("cash:setup.editDescription")}</p>
          {settings.referenceAt ? null : <p className="muted text-sm">{t("cash:setup.none")}</p>}
          {initialState}
          {settings.referenceAt ? (
            <div className="border-t border-line pt-3">
              <OpeningDividendsStep key={settings.updatedAt ?? "opening-dividends"} onDone={async (saved) => { if (saved) await initialStateSaved(); }} />
            </div>
          ) : null}
        </Collapsible>
      )}
    </div>
  );
}
