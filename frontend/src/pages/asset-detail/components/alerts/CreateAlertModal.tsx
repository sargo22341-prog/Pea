import { ALERT_COOLDOWN_HOURS, ALERT_LIMITS, ALERT_THRESHOLD_TYPES, ALERT_TYPES, MA200_CROSS_DIRECTIONS, type AlertParams, type AlertType, type Ma200CrossDirection } from "@pea/shared";
import { X } from "lucide-react";
import { useId, useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { describeAlert } from "../../../../components/common/alerts/alert-labels";
import { DetailsToggle } from "../../../../components/common/disclosure/DetailsToggle";
import { MOTION } from "../../../../components/common/motion";
import { usePullToRefreshSuspended } from "../../../../hooks/usePullToRefreshSuspended";
import { api } from "../../../../lib/api";

/** Variation journalière proposée par défaut (± %). */
const DEFAULT_DAILY_CHANGE_PERCENT = 5;

function defaultThreshold(type: AlertType, currentPrice: number) {
  if (type === "daily_change") return String(DEFAULT_DAILY_CHANGE_PERCENT);
  return Number.isFinite(currentPrice) && currentPrice > 0 ? String(Number(currentPrice.toPrecision(6))) : "";
}

/** Création rapide d'une alerte : type et seuil, anti-rebond replié dans les options avancées. */
export function CreateAlertModal({ symbol, name, currency, currentPrice, onClose }: { symbol: string; name: string; currency: string; currentPrice: number; onClose: () => void }) {
  const { t } = useTranslation(["alerts", "common"]);
  usePullToRefreshSuspended();
  const [type, setType] = useState<AlertType>("price_above");
  const [threshold, setThreshold] = useState(() => defaultThreshold("price_above", currentPrice));
  const [direction, setDirection] = useState<Ma200CrossDirection>("both");
  const [cooldown, setCooldown] = useState(String(ALERT_COOLDOWN_HOURS));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const cooldownHelpId = useId();
  const needsThreshold = ALERT_THRESHOLD_TYPES.includes(type);

  function changeType(next: AlertType) {
    setType(next);
    setThreshold(defaultThreshold(next, currentPrice));
  }

  function params(): AlertParams {
    const cooldownHours = Number(cooldown);
    return {
      ...(needsThreshold ? { threshold: Number(threshold.replace(",", ".")) } : {}),
      ...(type === "ma200_cross" ? { direction } : {}),
      ...(cooldownHours !== ALERT_COOLDOWN_HOURS ? { cooldownHours } : {})
    };
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const alert = await api.createAlert({ symbol, type, params: params() });
      setCreated(describeAlert(alert.type, alert.params, currency, t));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center ${MOTION.overlay}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation">
      <form aria-label={t("create.title", { name })} className={`card w-full max-w-md space-y-4 p-4 ${MOTION.dialog}`} onSubmit={(event) => void submit(event)} role="dialog">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("create.title", { name })}</h2>
          <button aria-label={t("common:actions.close")} className="btn-ghost" onClick={onClose} type="button"><X size={17} /></button>
        </div>
        {created ? (
          <div className={`space-y-3 ${MOTION.rise}`}>
            <p className="text-sm text-mint">{t("create.done", { condition: created })}</p>
            <div className="flex justify-end gap-2">
              <Link className="btn-ghost" to="/alerts">{t("create.seeAll")}</Link>
              <button className="btn-primary" onClick={onClose} type="button">{t("common:actions.close")}</button>
            </div>
          </div>
        ) : (
          <>
            <label className="block space-y-1 text-sm">
              <span className="text-slate-300">{t("create.type")}</span>
              <select className="input" onChange={(event) => { changeType(ALERT_TYPES.find((value) => value === event.target.value) ?? "price_above"); }} value={type}>
                {ALERT_TYPES.map((value) => <option key={value} value={value}>{t(`types.${value}`)}</option>)}
              </select>
            </label>
            {needsThreshold && (
              <label className="block space-y-1 text-sm">
                <span className="text-slate-300">{type === "daily_change" ? t("create.thresholdPercent") : t("create.thresholdPrice", { currency })}</span>
                <input className="input" inputMode="decimal" min={0} onChange={(event) => { setThreshold(event.target.value); }} required step="any" type="number" value={threshold} />
              </label>
            )}
            {type === "ma200_cross" && (
              <label className="block space-y-1 text-sm">
                <span className="text-slate-300">{t("create.direction")}</span>
                <select className="input" onChange={(event) => { setDirection(MA200_CROSS_DIRECTIONS.find((value) => value === event.target.value) ?? "both"); }} value={direction}>
                  {MA200_CROSS_DIRECTIONS.map((value) => <option key={value} value={value}>{t(`directions.${value}`)}</option>)}
                </select>
              </label>
            )}
            <DetailsToggle label={t("create.advanced")} storageKey="alerts.createAdvanced">
              <div className="space-y-1 text-sm">
                <label className="block space-y-1">
                  <span className="text-slate-300">{t("create.cooldown")}</span>
                  <input aria-describedby={cooldownHelpId} className="input" max={ALERT_LIMITS.cooldownHours.max} min={ALERT_LIMITS.cooldownHours.min} onChange={(event) => { setCooldown(event.target.value); }} required step={1} type="number" value={cooldown} />
                </label>
                <p className="text-xs text-slate-500" id={cooldownHelpId}>{t("create.cooldownHelp")}</p>
              </div>
            </DetailsToggle>
            <p className="text-xs text-slate-500">{t("create.evaluationNote")}</p>
            {error && <p className="text-sm text-coral">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={onClose} type="button">{t("common:actions.cancel")}</button>
              <button className="btn-primary" disabled={saving} type="submit">{t("create.submit")}</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
