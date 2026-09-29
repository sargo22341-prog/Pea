import type { UserAlert } from "@pea/shared";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AssetIcon } from "../../../components/common/AssetIcon";
import { describeAlert } from "../../../components/common/alerts/alert-labels";
import { ConfirmDialog } from "../../../components/common/feedback/ConfirmDialog";
import { MOTION, staggerDelay } from "../../../components/common/motion";
import { formatArticleDate } from "../../../lib/format";

/** Alertes configurées : pause / reprise et suppression (confirmée). */
export function AlertsList({ alerts, onToggle, onDelete }: { alerts: readonly UserAlert[]; onToggle: (alert: UserAlert) => void; onDelete: (alert: UserAlert) => void }) {
  const { t } = useTranslation(["alerts", "common"]);
  const [deleting, setDeleting] = useState<UserAlert | null>(null);

  if (!alerts.length) return <div className="card p-6 text-center text-sm text-slate-400">{t("list.empty")}</div>;

  return (
    <>
      <ul className="card divide-y divide-line">
        {alerts.map((alert, index) => (
          <li className={`flex flex-wrap items-center gap-3 p-4 ${MOTION.rise}`} key={alert.id} style={{ animationDelay: staggerDelay(index) }}>
            <Link className="flex min-w-0 flex-1 items-center gap-3 hover:text-sky" to={`/assets/${encodeURIComponent(alert.symbol)}`}>
              <AssetIcon className="h-8 w-8" symbol={alert.symbol} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{alert.assetName}</span>
                <span className={`block text-sm ${alert.active ? "text-slate-300" : "text-slate-500 line-through"}`}>{describeAlert(alert.type, alert.params, alert.currency ?? "EUR", t)}</span>
                {alert.lastTriggeredAt && <span className="block text-xs text-slate-500">{t("list.lastTriggered", { date: formatArticleDate(alert.lastTriggeredAt) })}</span>}
              </span>
            </Link>
            <button
              aria-checked={alert.active}
              aria-label={t("list.toggle", { name: alert.assetName })}
              className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${alert.active ? "bg-mint" : "bg-panel2"}`}
              onClick={() => { onToggle(alert); }}
              role="switch"
              type="button"
            >
              <span className={`h-4 w-4 rounded-full bg-white transition ${alert.active ? "translate-x-5" : ""}`} />
            </button>
            <button aria-label={t("list.delete", { name: alert.assetName })} className="rounded-md p-2 text-slate-400 transition hover:bg-panel2 hover:text-coral" onClick={() => { setDeleting(alert); }} type="button">
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
      {deleting && (
        <ConfirmDialog
          confirmLabel={t("common:actions.delete")}
          danger
          description={t("list.deleteConfirm", { condition: describeAlert(deleting.type, deleting.params, deleting.currency ?? "EUR", t), name: deleting.assetName })}
          onCancel={() => { setDeleting(null); }}
          onConfirm={() => { onDelete(deleting); setDeleting(null); }}
          title={t("list.deleteTitle")}
        />
      )}
    </>
  );
}
