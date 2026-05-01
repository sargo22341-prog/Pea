import type { DataConstructionJobDto } from "@pea/shared";
import { Database, Info, RefreshCcw, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { api, type MarketDataRebuildRange } from "../../lib/api";
import { hasDataConstructionJob, notifyDataConstructionChanged } from "../../lib/dataConstruction";
import { Collapsible, Toast, type SettingsToast } from "./SettingsSection";

type ActionKey = `rebuild:${MarketDataRebuildRange}` | "financials" | "dividends" | "snapshots";

interface QuickAction {
  key: ActionKey;
  label: string;
  info: string;
  icon: LucideIcon;
  confirm?: string;
  run: () => Promise<DataConstructionJobDto>;
}

const rebuildActions: QuickAction[] = [
  {
    key: "rebuild:1d",
    label: "Reconstruire donnees marche 1D",
    info: "Supprime et reconstruit uniquement les donnees intraday 1D des assets suivis.",
    icon: Database,
    confirm: "Cette action va supprimer puis reconstruire les donnees marche 1D pour tous les assets suivis. Continuer ?",
    run: () => api.rebuildMarketData("1d")
  },
  {
    key: "rebuild:1w",
    label: "Reconstruire donnees marche 1W",
    info: "Supprime et reconstruit uniquement les candles 1W selon l'interval configure.",
    icon: Database,
    confirm: "Cette action va supprimer puis reconstruire les donnees marche 1W pour tous les assets suivis. Continuer ?",
    run: () => api.rebuildMarketData("1w")
  },
  {
    key: "rebuild:1m",
    label: "Reconstruire donnees marche 1M",
    info: "Supprime et reconstruit uniquement les candles 1M selon l'interval configure.",
    icon: Database,
    confirm: "Cette action va supprimer puis reconstruire les donnees marche 1M pour tous les assets suivis. Continuer ?",
    run: () => api.rebuildMarketData("1m")
  },
  {
    key: "rebuild:all",
    label: "Reconstruire donnees marche ALL",
    info: "Supprime et reconstruit l'historique journalier complet utilise pour YTD, 1Y, 5Y, 10Y et ALL.",
    icon: Database,
    confirm: "Cette action va supprimer puis reconstruire les donnees marche ALL pour tous les assets suivis. Continuer ?",
    run: () => api.rebuildMarketData("all")
  },
  {
    key: "rebuild:all_ranges",
    label: "Reconstruire toutes les donnees marche",
    info: "Supprime et reconstruit toutes les ranges marche : 1D, 1W, 1M et ALL.",
    icon: Database,
    confirm: "Cette action va supprimer puis reconstruire toutes les donnees marche pour tous les assets suivis. Continuer ?",
    run: () => api.rebuildMarketData("all_ranges")
  }
];

const annexActions: QuickAction[] = [
  {
    key: "snapshots",
    label: "Rafraichir snapshots marche",
    info: "Rafraichit les derniers prix, variations et volumes connus des assets suivis.",
    icon: Database,
    run: api.refreshMarketSnapshots
  },
  {
    key: "financials",
    label: "Rafraichir donnees financieres",
    info: "Rafraichit les donnees financieres annuelles disponibles via Yahoo.",
    icon: RefreshCcw,
    run: api.refreshFinancials
  },
  {
    key: "dividends",
    label: "Rafraichir dividendes",
    info: "Rafraichit les dividendes par asset sans toucher aux transactions du portefeuille.",
    icon: RefreshCcw,
    run: api.refreshDividends
  }
];

export function MarketDataActionsSection() {
  const [running, setRunning] = useState<ActionKey | null>(null);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  async function runAction(action: QuickAction) {
    if (action.confirm && !window.confirm(action.confirm)) return;
    setRunning(action.key);
    setToast(null);
    try {
      const result = await action.run();
      if (hasDataConstructionJob(result)) notifyDataConstructionChanged(result);
      setToast({ tone: "success", text: `${result.totalTasks} taches planifiees` });
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Action impossible" });
    } finally {
      setRunning(null);
    }
  }

  return (
    <Collapsible title="Actions rapides">
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      <ActionGroup actions={rebuildActions} onRun={runAction} running={running} title="Marche - Reconstruction" />
      <ActionGroup actions={annexActions} onRun={runAction} running={running} title="Marche - Donnees annexes" />
    </Collapsible>
  );
}

function ActionGroup({
  actions,
  onRun,
  running,
  title
}: {
  actions: QuickAction[];
  onRun: (action: QuickAction) => void;
  running: ActionKey | null;
  title: string;
}) {
  return (
    <section className="mt-4 border-t border-slate-700/60 pt-4 first:mt-0 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((action) => (
          <ActionButton
            icon={action.icon}
            info={action.info}
            key={action.key}
            label={action.label}
            loading={running === action.key}
            onClick={() => onRun(action)}
          />
        ))}
      </div>
    </section>
  );
}

function ActionButton({
  icon: Icon,
  info,
  label,
  loading,
  onClick
}: {
  icon: LucideIcon;
  info: string;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button className="btn-ghost min-w-0 flex-1 justify-start gap-2" disabled={loading} onClick={onClick} type="button">
        <Icon size={18} />
        <span className="truncate">{loading ? "En cours..." : label}</span>
      </button>
      <button aria-label={`Information - ${label}`} className="btn-ghost shrink-0 px-2" title={info} type="button">
        <Info size={16} />
      </button>
    </div>
  );
}
