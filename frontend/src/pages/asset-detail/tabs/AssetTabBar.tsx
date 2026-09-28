import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MOTION } from "../../../components/common/motion";
import type { AssetTabId } from "./asset-tabs";

/**
 * Barre d'onglets collante de la fiche actif. Sur mobile elle défile horizontalement ; le
 * soulignement de l'onglet actif glisse d'un onglet à l'autre.
 */
export function AssetTabBar({ tabs, active, onSelect }: { tabs: readonly AssetTabId[]; active: AssetTabId; onSelect: (tab: AssetTabId) => void }) {
  const { t } = useTranslation("asset");
  const buttonsRef = useRef(new Map<AssetTabId, HTMLButtonElement>());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const button = buttonsRef.current.get(active);
    setIndicator(button ? { left: button.offsetLeft, width: button.offsetWidth } : null);
  }, [active, tabs]);

  return (
    <nav aria-label={t("tabs.label")} className="sticky top-0 z-20 -mx-1 overflow-x-auto bg-ink/85 px-1 backdrop-blur">
      <div className="relative flex min-w-max gap-1 border-b border-line" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-selected={tab === active}
            className={`px-3 py-3 text-sm font-semibold transition-colors ${tab === active ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
            key={tab}
            onClick={() => { onSelect(tab); }}
            ref={(element) => {
              if (element) buttonsRef.current.set(tab, element);
              else buttonsRef.current.delete(tab);
            }}
            role="tab"
            type="button"
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
        {indicator ? (
          <span
            aria-hidden
            className={`absolute bottom-0 left-0 h-0.5 rounded-full bg-sky ${MOTION.tabIndicator}`}
            style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
          />
        ) : null}
      </div>
    </nav>
  );
}
