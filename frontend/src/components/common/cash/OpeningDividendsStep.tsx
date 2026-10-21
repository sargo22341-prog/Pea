import type { OpeningDividendsEstimate } from "@pea/shared";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { usePrivacy } from "../../../contexts/privacy-context";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";
import { cashMoney } from "../../../lib/cash/cash-format";
import { formatMaybeDate } from "../../../lib/format";
import { masquerValeur } from "../../../lib/privacy";
import { InfoHint } from "../disclosure/InfoHint";

function Line({ label, value, strong = false }: { label: ReactNode; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "border-t border-line pt-1 font-semibold text-slate-100" : ""}`}>
      <dt>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

/** Montant proposé : déjà confirmé, sinon le calcul s'il est positif, sinon l'estimation publiée. */
function suggestedAmount(estimate: OpeningDividendsEstimate) {
  return estimate.declared ?? (estimate.implied >= 0 ? estimate.implied : estimate.publishedNet);
}

/**
 * Dividendes déjà perçus avant l'état initial : déduits du solde déclaré et des opérations
 * enregistrées, recoupés avec les dividendes publiés, puis confirmés ou corrigés par l'utilisateur.
 * Ils n'alimentent que l'indicateur « Dividendes encaissés » : ni le solde ni les versements.
 */
export function OpeningDividendsStep({ onDone, skipLabel }: { onDone: (saved: boolean) => void | Promise<void>; skipLabel?: string | undefined }) {
  const { t } = useTranslation(["cash", "errors"]);
  const prive = usePrivacy();
  const estimate = useAsync((signal) => api.openingDividendsEstimate(signal), "opening-dividends");
  const [amount, setAmount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const money = (value: number) => masquerValeur(cashMoney(value), prive);

  if (estimate.error) return <p className="text-sm text-coral" role="alert">{estimate.error}</p>;
  if (!estimate.data) return <p className="muted text-sm">{t("cash:openingDividends.loading")}</p>;
  const data = estimate.data;
  const value = amount ?? String(suggestedAmount(data));

  async function save(next: number | null) {
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      setError(t("errors:numericInvalid"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.confirmOpeningDividends(next);
      await onDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors:unknown"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div>
        <h3 className="font-semibold">
          {t("cash:openingDividends.title")} <InfoHint label={t("cash:openingDividends.info")}>{t("cash:hints.openingDividends")}</InfoHint>
        </h3>
        <p className="muted">{t("cash:openingDividends.intro", { date: formatMaybeDate(data.referenceAt) })}</p>
      </div>
      <dl className="space-y-1 rounded-md border border-line p-3 text-slate-300">
        <Line label={t("cash:openingDividends.cash")} value={money(data.cash)} />
        <Line label={t("cash:openingDividends.netDeposits")} value={`- ${money(data.netDeposits)}`} />
        <Line label={t("cash:openingDividends.buys")} value={`+ ${money(data.buys)}`} />
        <Line label={t("cash:openingDividends.sells")} value={`- ${money(data.sells)}`} />
        <Line label={t("cash:openingDividends.fees")} value={`+ ${money(data.standaloneFees)}`} />
        {data.otherCredits ? <Line label={t("cash:openingDividends.otherCredits")} value={`- ${money(data.otherCredits)}`} /> : null}
        <Line label={t("cash:openingDividends.implied")} strong value={money(data.implied)} />
      </dl>
      <p className="muted">{t("cash:openingDividends.published", { gross: money(data.publishedGross), net: money(data.publishedNet) })}</p>
      {data.warnings.map((warning) => (
        <p className="rounded-md border border-amber/40 bg-amber/10 p-2 text-xs text-amber" key={warning}>{t(`cash:openingDividends.warnings.${warning}`)}</p>
      ))}
      <label className="block">
        <span className="muted mb-1 block">{t("cash:openingDividends.amount")}</span>
        <input className="input" min="0" onChange={(event) => { setAmount(event.target.value); }} step="0.01" type="number" value={value} />
      </label>
      {error ? <p className="text-coral" role="alert">{error}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className="btn-ghost" disabled={saving} onClick={() => void onDone(false)} type="button">{skipLabel ?? t("cash:openingDividends.skip")}</button>
        {data.declared !== undefined ? <button className="btn-ghost" disabled={saving} onClick={() => void save(null)} type="button">{t("cash:openingDividends.clear")}</button> : null}
        <button className="btn-primary" disabled={saving} onClick={() => void save(Number(value))} type="button">{t("cash:openingDividends.confirm")}</button>
      </div>
    </div>
  );
}
