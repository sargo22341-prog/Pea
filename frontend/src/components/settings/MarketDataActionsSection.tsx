import type { DataConstructionJobDto } from "@pea/shared";
import { Database, RefreshCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { hasDataConstructionJob, notifyDataConstructionChanged } from "../../lib/dataConstruction";
import { Collapsible, Toast, type SettingsToast } from "./SettingsSection";

type ActionKey = "clear" | "rebuild" | "financials" | "dividends" | "snapshots";

export function MarketDataActionsSection() {
  const [running, setRunning] = useState<ActionKey | null>(null);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  async function run(key: ActionKey, action: () => Promise<DataConstructionJobDto | { clearedTables: string[] }>) {
    if (key === "clear" && !window.confirm("Vider les donnees de marche reconstruites ? Les utilisateurs, transactions et positions seront conserves.")) return;
    setRunning(key);
    setToast(null);
    try {
      const result = await action();
      if (hasDataConstructionJob("id" in result ? result : null)) notifyDataConstructionChanged(result as DataConstructionJobDto);
      const detail = "clearedTables" in result ? `${result.clearedTables.length} tables nettoyees` : `${result.totalTasks} taches planifiees`;
      setToast({ tone: "success", text: detail });
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Action impossible" });
    } finally {
      setRunning(null);
    }
  }

  return (
    <Collapsible title="Actions rapides">
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionButton
          icon={Trash2}
          label="Vider les donnees de marche"
          loading={running === "clear"}
          onClick={() => void run("clear", api.clearMarketData)}
        />
        <ActionButton
          icon={Database}
          label="Reconstruire toutes les donnees marche"
          loading={running === "rebuild"}
          onClick={() => void run("rebuild", api.rebuildAllMarketData)}
        />
        <ActionButton
          icon={RefreshCcw}
          label="Rafraichir les donnees financieres"
          loading={running === "financials"}
          onClick={() => void run("financials", api.refreshFinancials)}
        />
        <ActionButton
          icon={RefreshCcw}
          label="Rafraichir les dividendes"
          loading={running === "dividends"}
          onClick={() => void run("dividends", api.refreshDividends)}
        />
        <ActionButton
          icon={Database}
          label="Rafraichir les snapshots marche"
          loading={running === "snapshots"}
          onClick={() => void run("snapshots", api.refreshMarketSnapshots)}
        />
      </div>
    </Collapsible>
  );
}

function ActionButton({
  icon: Icon,
  label,
  loading,
  onClick
}: {
  icon: typeof RefreshCcw;
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button className="btn-ghost justify-start gap-2" disabled={loading} onClick={onClick} type="button">
      <Icon size={18} />
      <span>{loading ? "En cours..." : label}</span>
    </button>
  );
}
