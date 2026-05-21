import type { DataConstructionJobDto } from "@pea/shared";
import { AlertTriangle, Database, Info, RefreshCcw, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Collapsible, Toast, type SettingsToast } from "../../../components/common/feedback";
import { api, type MarketDataRebuildRange } from "../../../lib/api";
import { hasDataConstructionJob, notifyDataConstructionChanged } from "../../../lib/dataConstruction";

type ActionKey = `rebuild:${MarketDataRebuildRange}` | "refresh-annex" | "cleanup-unlinked-assets";
type ActionTranslationKey =
  | "rebuild1d"
  | "rebuild1w"
  | "rebuild1m"
  | "rebuildAll"
  | "rebuildAllRanges"
  | "refreshAnnex"
  | "cleanupUnlinked";

interface QuickAction {
  key: ActionKey;
  translationKey: ActionTranslationKey;
  icon: LucideIcon;
  run: () => Promise<DataConstructionJobDto>;
}

const rebuildActions: QuickAction[] = [
  { key: "rebuild:1d", translationKey: "rebuild1d", icon: Database, run: () => api.rebuildMarketData("1d") },
  { key: "rebuild:1w", translationKey: "rebuild1w", icon: Database, run: () => api.rebuildMarketData("1w") },
  { key: "rebuild:1m", translationKey: "rebuild1m", icon: Database, run: () => api.rebuildMarketData("1m") },
  { key: "rebuild:all", translationKey: "rebuildAll", icon: Database, run: () => api.rebuildMarketData("all") },
  { key: "rebuild:all_ranges", translationKey: "rebuildAllRanges", icon: Database, run: () => api.rebuildMarketData("all_ranges") }
];

const annexActions: QuickAction[] = [
  { key: "refresh-annex", translationKey: "refreshAnnex", icon: RefreshCcw, run: api.refreshAnnexData },
  { key: "cleanup-unlinked-assets", translationKey: "cleanupUnlinked", icon: Database, run: api.cleanupUnlinkedMarketAssets }
];

function actionText(t: (key: string, options?: Record<string, unknown>) => string, action: QuickAction, suffix = "") {
  return t(`admin.actionsPanel.${action.translationKey}${suffix}`, { ns: "common" });
}

export function MarketDataActionsSection({ open, onToggle }: { open?: boolean; onToggle?: () => void }) {
  const { t } = useTranslation(["common"]);
  const [running, setRunning] = useState<ActionKey | null>(null);
  const [pendingAction, setPendingAction] = useState<QuickAction | null>(null);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  function requestAction(action: QuickAction) {
    if (running) return;
    setPendingAction(action);
  }

  async function runAction(action: QuickAction) {
    setPendingAction(null);
    setRunning(action.key);
    setToast(null);
    try {
      const result = await action.run();
      if (hasDataConstructionJob(result)) notifyDataConstructionChanged(result);
      setToast({ tone: "success", text: result.currentMessage || t("admin.actionsPanel.tasksPlanned", { count: result.totalTasks, ns: "common" }) });
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("admin.actionsPanel.failed", { ns: "common" }) });
    } finally {
      setRunning(null);
    }
  }

  return (
    <Collapsible onToggle={onToggle} open={open} title={t("admin.actionsPanel.title", { ns: "common" })}>
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      <ActionGroup actions={rebuildActions} onRun={requestAction} running={running} title={t("admin.actionsPanel.rebuildGroup", { ns: "common" })} />
      <ActionGroup actions={annexActions} onRun={requestAction} running={running} title={t("admin.actionsPanel.annexGroup", { ns: "common" })} />
      {pendingAction && <ConfirmActionDialog action={pendingAction} onCancel={() => setPendingAction(null)} onConfirm={() => void runAction(pendingAction)} />}
    </Collapsible>
  );
}

function ActionGroup({ actions, onRun, running, title }: { actions: QuickAction[]; onRun: (action: QuickAction) => void; running: ActionKey | null; title: string }) {
  const { t } = useTranslation(["common"]);
  return (
    <section className="mt-4 border-t border-slate-700/60 pt-4 first:mt-0 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((action) => (
          <ActionButton icon={action.icon} info={actionText(t, action, "Info")} key={action.key} label={actionText(t, action)} loading={running === action.key} onClick={() => onRun(action)} />
        ))}
      </div>
    </section>
  );
}

function ActionButton({ icon: Icon, info, label, loading, onClick }: { icon: LucideIcon; info: string; label: string; loading: boolean; onClick: () => void }) {
  const { t } = useTranslation(["common"]);
  return (
    <div className="flex items-center gap-2">
      <button className="btn-ghost min-w-0 flex-1 justify-start gap-2" disabled={loading} onClick={onClick} type="button">
        <Icon size={18} />
        <span className="truncate">{loading ? t("admin.actionsPanel.running", { ns: "common" }) : label}</span>
      </button>
      <InfoTooltip info={info} label={label} />
    </div>
  );
}

function InfoTooltip({ info, label }: { info: string; label: string }) {
  const { t } = useTranslation(["common"]);
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="group relative shrink-0" ref={wrapperRef}>
      <button aria-describedby={tooltipId} aria-expanded={open} aria-label={t("admin.actionsPanel.info", { label, ns: "common" })} className="btn-ghost px-2" onClick={() => setOpen((current) => !current)} onFocus={() => setOpen(true)} type="button">
        <Info size={16} />
      </button>
      <div className={`pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-line bg-ink px-3 py-2 text-left text-xs font-medium leading-5 text-slate-200 shadow-glow transition duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 ${open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`} id={tooltipId} role="tooltip">
        {info}
      </div>
    </div>
  );
}

function ConfirmActionDialog({ action, onCancel, onConfirm }: { action: QuickAction; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useTranslation(["common"]);
  const Icon = action.icon;
  const label = actionText(t, action);
  const info = actionText(t, action, "Info");

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center" onClick={onCancel} role="presentation">
      <div aria-describedby="quick-action-confirm-description" aria-labelledby="quick-action-confirm-title" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-lg border border-line bg-ink/95 shadow-glow backdrop-blur" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="flex items-start gap-3 border-b border-line p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber/40 bg-amber/10 text-amber">
            <AlertTriangle size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="muted">{t("admin.actionsPanel.validationRequired", { ns: "common" })}</p>
            <h3 className="text-base font-semibold" id="quick-action-confirm-title">{label}</h3>
          </div>
          <button aria-label={t("admin.actionsPanel.close", { ns: "common" })} className="btn-ghost shrink-0 px-2" onClick={onCancel} type="button">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm leading-6 text-slate-300" id="quick-action-confirm-description">{actionText(t, action, "Confirm")}</p>
          <div className="flex items-center gap-2 rounded-md border border-line bg-panel2/70 p-3 text-sm text-slate-300">
            <Icon className="shrink-0 text-sky" size={17} />
            <span>{info}</span>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          <button className="btn-ghost" onClick={onCancel} type="button">{t("actions.cancel", { ns: "common" })}</button>
          <button className="btn-primary" onClick={onConfirm} type="button">{t("admin.actionsPanel.validate", { ns: "common" })}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
