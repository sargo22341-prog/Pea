import type { DataConstructionJobDto } from "@pea/shared";
import { AlertTriangle, Database, Info, RefreshCcw, X, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api, type MarketDataRebuildRange } from "../../lib/api";
import { hasDataConstructionJob, notifyDataConstructionChanged } from "../../lib/dataConstruction";
import { Collapsible, Toast, type SettingsToast } from "./SettingsSection";

type ActionKey = `rebuild:${MarketDataRebuildRange}` | "refresh-annex" | "cleanup-unlinked-assets";

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
    key: "refresh-annex",
    label: "Rafraichir toutes les donnees",
    info: "Vide tous les caches non-chart et re-telecharge : snapshots, financiers, dividendes, news, profils, consensus analystes et evenements calendrier.",
    icon: RefreshCcw,
    confirm: "Cette action va vider tous les caches (hors charts) et re-telecharger l'ensemble des donnees annexes pour tous les assets suivis. Continuer ?",
    run: api.refreshAnnexData
  },
  {
    key: "cleanup-unlinked-assets",
    label: "Supprimer assets non lies",
    info: "Supprime les donnees des actions et ETF explores qui ne sont ni en portefeuille ni en liste de suivi.",
    icon: Database,
    confirm: "Cette action va supprimer les donnees des assets explores qui ne sont lies ni a une transaction ni a la liste de suivi. Les assets suivis et ceux en portefeuille seront conserves. Continuer ?",
    run: api.cleanupUnlinkedMarketAssets
  }
];

export function MarketDataActionsSection() {
  const [running, setRunning] = useState<ActionKey | null>(null);
  const [pendingAction, setPendingAction] = useState<QuickAction | null>(null);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  function requestAction(action: QuickAction) {
    if (running) return;
    if (action.confirm) {
      setPendingAction(action);
      return;
    }
    void runAction(action);
  }

  async function runAction(action: QuickAction) {
    setPendingAction(null);
    setRunning(action.key);
    setToast(null);
    try {
      const result = await action.run();
      if (hasDataConstructionJob(result)) notifyDataConstructionChanged(result);
      setToast({ tone: "success", text: result.currentMessage || `${result.totalTasks} taches planifiees` });
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Action impossible" });
    } finally {
      setRunning(null);
    }
  }

  return (
    <Collapsible title="Actions rapides">
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      <ActionGroup actions={rebuildActions} onRun={requestAction} running={running} title="Marche - Reconstruction" />
      <ActionGroup actions={annexActions} onRun={requestAction} running={running} title="Marche - Donnees annexes" />
      {pendingAction && (
        <ConfirmActionDialog
          action={pendingAction}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void runAction(pendingAction)}
        />
      )}
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

function ConfirmActionDialog({
  action,
  onCancel,
  onConfirm
}: {
  action: QuickAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const Icon = action.icon;

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center"
      onClick={onCancel}
      role="presentation"
    >
      <div
        aria-describedby="quick-action-confirm-description"
        aria-labelledby="quick-action-confirm-title"
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-lg border border-line bg-ink/95 shadow-glow backdrop-blur"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start gap-3 border-b border-line p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber/40 bg-amber/10 text-amber">
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="muted">Validation requise</p>
            <h3 className="text-base font-semibold" id="quick-action-confirm-title">
              {action.label}
            </h3>
          </div>
          <button aria-label="Fermer" className="btn-ghost shrink-0 px-2" onClick={onCancel} type="button">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-sm leading-6 text-slate-300" id="quick-action-confirm-description">
            {action.confirm}
          </p>
          <div className="flex items-center gap-2 rounded-md border border-line bg-panel2/70 p-3 text-sm text-slate-300">
            <Icon className="shrink-0 text-sky" size={17} />
            <span>{action.info}</span>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          <button className="btn-ghost" onClick={onCancel} type="button">
            Annuler
          </button>
          <button className="btn-primary" onClick={onConfirm} type="button">
            Valider l'action
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
