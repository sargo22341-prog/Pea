import type { PortfolioSummary } from "@pea/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InfoHint } from "../../../components/common/disclosure/InfoHint";
import { usePrivacy } from "../../../contexts/privacy-context";
import { cashMoney } from "../../../lib/cash/cash-format";
import { percent } from "../../../lib/format";
import { formatFractionPercent } from "../../../lib/format-metrics";
import { masquerValeur } from "../../../lib/privacy";

type Tone = "positive" | "negative" | undefined;

function toneOf(value: number): Tone {
  return value >= 0 ? "positive" : "negative";
}

function Row({ label, hint, value, tone, strong = false }: { label: string; hint: string; value: string; tone?: Tone; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="muted flex items-center gap-1">
        <span>{label}</span>
        <InfoHint label={label}>{hint}</InfoHint>
      </dt>
      <dd className={`text-right ${strong ? "text-lg font-bold" : "font-semibold"} ${tone === "positive" ? "text-mint" : tone === "negative" ? "text-coral" : ""}`}>{value}</dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2 font-semibold">{title}</h2>
      <dl className="divide-y divide-line text-sm">{children}</dl>
    </section>
  );
}

/**
 * Détail du compte PEA en trois blocs : valeur, versements, performance. Tant que l'état initial
 * n'est pas confirmé, seules les données des positions (fiables) sont affichées.
 */
export function PeaOverviewCards({ summary }: { summary: PortfolioSummary }) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const show = (value: number) => masquerValeur(cashMoney(value, summary.currency), prive);
  const pea = summary.pea?.status === "ready" ? summary.pea : undefined;
  const yieldOnCost = summary.yieldOnCost !== undefined && summary.yieldOnCost > 0 ? summary.yieldOnCost : undefined;
  const fees = summary.totalFees + (pea?.standaloneFees ?? 0);

  const performanceLabel = pea?.annualizedReturnPercent !== undefined
    ? t("metrics.annualized", { value: percent(pea.annualizedReturnPercent) })
    : pea?.simpleReturnPercent !== undefined ? t("metrics.simpleReturn", { value: percent(pea.simpleReturnPercent) }) : undefined;
  const ceilingUsedPercent = pea ? Math.min(100, (pea.deposits / pea.depositCeiling) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title={t("overview.value")}>
          {pea ? <Row hint={t("hints.peaValue")} label={t("metrics.peaValue")} strong value={show(pea.totalValue)} /> : null}
          <Row hint={t("hints.positionsValue")} label={t("metrics.positionsValue")} strong={!pea} value={show(pea?.positionsValue ?? summary.totalValue)} />
          {pea ? <Row hint={t("hints.cash")} label={t("metrics.cash")} value={show(pea.cash)} /> : null}
          <Row hint={t("hints.costBasis")} label={t("overview.costBasis")} value={show(summary.totalCost)} />
        </Card>

        {pea ? (
          <Card title={t("overview.flows")}>
            <Row hint={t("hints.deposits")} label={t("metrics.deposits")} strong value={show(pea.deposits)} />
            <Row hint={t("hints.withdrawals")} label={t("metrics.withdrawals")} value={show(pea.withdrawals)} />
            <Row hint={t("hints.netDeposits")} label={t("metrics.netDeposits")} value={show(pea.netDeposits)} />
            <Row hint={t("hints.remainingCeiling")} label={t("metrics.remainingCeiling")} value={show(pea.remainingCeiling)} />
            <div className="pt-2">
              <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-panel2">
                <div className="h-full rounded-full bg-sky" style={{ width: `${ceilingUsedPercent}%` }} />
              </div>
              <p className="muted mt-1 text-xs">{t("metrics.ceilingHint", { ceiling: cashMoney(pea.depositCeiling) })}</p>
            </div>
          </Card>
        ) : null}

        <Card title={t("overview.performance")}>
          {pea ? (
            <Row hint={t("hints.globalGain")} label={t("metrics.globalGain")} strong tone={toneOf(pea.globalGain)} value={masquerValeur(performanceLabel ? `${cashMoney(pea.globalGain)} (${performanceLabel})` : cashMoney(pea.globalGain), prive)} />
          ) : null}
          <Row hint={t("hints.latentGain")} label={t("metrics.latentGain")} tone={toneOf(summary.totalPerformance)} value={masquerValeur(`${cashMoney(summary.totalPerformance)} (${percent(summary.totalPerformancePercent)})`, prive)} />
          {pea ? <Row hint={t("hints.realizedGain")} label={t("metrics.realizedGain")} tone={toneOf(pea.realizedGain)} value={show(pea.realizedGain)} /> : null}
          {pea ? <Row hint={t("hints.cashDividends")} label={t("overview.cashDividends")} value={show(pea.cashDividends)} /> : null}
          {pea?.otherCredits ? <Row hint={t("hints.otherCredits")} label={t("overview.otherCredits")} value={show(pea.otherCredits)} /> : null}
          <Row hint={t("hints.estimatedDividends")} label={t("overview.estimatedDividends")} value={show(summary.totalDividendsReceived)} />
          {yieldOnCost !== undefined ? <Row hint={t("hints.yieldOnCost")} label={t("overview.yieldOnCost")} value={masquerValeur(formatFractionPercent(yieldOnCost), prive)} /> : null}
          <Row hint={t("hints.fees")} label={t("overview.fees")} value={show(fees)} />
        </Card>
      </div>
      {pea?.historyIncomplete ? <p className="muted text-xs">{t("metrics.historyIncomplete")}</p> : null}
    </div>
  );
}
