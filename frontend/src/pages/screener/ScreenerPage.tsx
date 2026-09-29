import { Columns3 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MOTION } from "../../components/common/motion";
import { useAsync } from "../../hooks/useAsync";
import { api } from "../../lib/api";
import { ScreenerFilterPanel } from "./components/ScreenerFilterPanel";
import { ScreenerPresetBar } from "./components/ScreenerPresetBar";
import { ScreenerResultsTable } from "./components/ScreenerResultsTable";
import { useScreener } from "./hooks/useScreener";
import { useScreenerPresets } from "./hooks/useScreenerPresets";

const EMPTY_OPTIONS = { sectors: [], countries: [] };

/** Screener PEA : filtre les actifs déjà connus de l'instance, sans appel Yahoo. */
export function ScreenerPage() {
  const { t } = useTranslation("screener");
  const screener = useScreener();
  const presets = useScreenerPresets();
  const options = useAsync((signal) => api.screenerOptions(signal));

  useEffect(() => {
    document.title = `${t("title")} | PEA Portfolio`;
    return () => { document.title = "PEA Portfolio"; };
  }, [t]);

  return (
    <div className={`space-y-6 ${MOTION.stagger}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="muted">{t("subtitle")}</p>
        </div>
        <Link className="btn-ghost" to="/compare">
          <Columns3 size={16} />
          {t("openCompare")}
        </Link>
      </div>

      <ScreenerPresetBar
        error={presets.error}
        onApply={screener.replaceFilters}
        onDelete={presets.remove}
        onSave={(name) => presets.save(name, screener.filters)}
        presets={presets.presets}
      />
      <ScreenerFilterPanel filters={screener.filters} onChange={screener.updateFilter} options={options.data ?? EMPTY_OPTIONS} />

      {screener.results.error ? <div className="card border-coral p-4 text-sm text-coral">{screener.results.error}</div> : null}
      {screener.results.data ? (
        <ScreenerResultsTable direction={screener.direction} onSort={screener.sortBy} response={screener.results.data} sort={screener.sort} />
      ) : screener.results.loading ? (
        <div className="h-64 animate-pulse rounded-[14px] bg-panel2" />
      ) : null}
      <p className="text-xs text-slate-500">{t("disclaimer")}</p>
    </div>
  );
}
