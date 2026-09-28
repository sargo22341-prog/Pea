import type { ChartOverlayKey } from "@pea/shared";
import { Layers } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MOTION } from "../../../components/common/motion";
import { CHART_OVERLAY_KEYS } from "../hooks/useChartOverlays";
import { MOVING_AVERAGE_COLORS } from "../../../components/charts/chartFormat";

/** Menu des calques du graphique de cours (moyennes mobiles, supports / résistances), à côté du sélecteur de période. */
export function ChartOverlayMenu({
  selected,
  onToggle,
  levels
}: {
  selected: readonly ChartOverlayKey[];
  onToggle: (key: ChartOverlayKey) => void;
  /** Supports / résistances, proposés seulement quand les signaux techniques en fournissent. */
  levels?: { available: boolean; selected: boolean; onToggle: () => void } | undefined;
}) {
  const { t } = useTranslation("asset");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={t("overlays.label")}
        className={selected.length || (levels?.available && levels.selected) ? "btn bg-sky/15 text-sky" : "btn-ghost"}
        onClick={() => { setOpen((current) => !current); }}
        type="button"
      >
        <Layers size={17} />
        {selected.length + (levels?.available && levels.selected ? 1 : 0) || null}
      </button>
      {open ? (
        <div className={`absolute right-0 z-30 mt-2 w-56 rounded-lg border border-line bg-panel p-2 shadow-glow ${MOTION.menu}`} role="menu">
          {CHART_OVERLAY_KEYS.map((key) => (
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-panel2" key={key}>
              <input checked={selected.includes(key)} onChange={() => { onToggle(key); }} role="menuitemcheckbox" type="checkbox" />
              <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ backgroundColor: MOVING_AVERAGE_COLORS[key] }} />
              {t(`overlays.${key}`)}
            </label>
          ))}
          {levels?.available ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-panel2">
              <input checked={levels.selected} onChange={levels.onToggle} role="menuitemcheckbox" type="checkbox" />
              <span aria-hidden className="h-0.5 w-4 rounded-full bg-slate-300" />
              {t("overlays.levels")}
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
