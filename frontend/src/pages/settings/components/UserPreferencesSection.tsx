import type { AppLanguage, DashboardSortKey, RangeKey, SortDirection, WatchlistSortKey } from "@pea/shared";
import { Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { formatRangeLabel } from "../../../lib/format";
import { Collapsible, Toast } from "../../../components/common/feedback";
import { languageOptions } from "../../../i18n";
import { PreferenceSwitch } from "../../../components/common/forms/PreferenceSwitch";

const sortOptions: { label: string; key: DashboardSortKey; direction: SortDirection }[] = [
  { label: "settings:sort.nameAsc", key: "name", direction: "asc" },
  { label: "settings:sort.nameDesc", key: "name", direction: "desc" },
  { label: "settings:sort.marketValueAsc", key: "currentMarketValue", direction: "asc" },
  { label: "settings:sort.marketValueDesc", key: "currentMarketValue", direction: "desc" },
  { label: "settings:sort.variationAsc", key: "intervalPerformancePercent", direction: "asc" },
  { label: "settings:sort.variationDesc", key: "intervalPerformancePercent", direction: "desc" }
];

const watchlistSortOptions: { label: string; key: WatchlistSortKey; direction: SortDirection }[] = [
  { label: "settings:sort.nameAsc", key: "name", direction: "asc" },
  { label: "settings:sort.nameDesc", key: "name", direction: "desc" },
  { label: "settings:sort.priceAsc", key: "price", direction: "asc" },
  { label: "settings:sort.priceDesc", key: "price", direction: "desc" },
  { label: "settings:sort.performanceAsc", key: "performancePercent", direction: "asc" },
  { label: "settings:sort.performanceDesc", key: "performancePercent", direction: "desc" }
];

const chartRanges: RangeKey[] = ["1d", "1w", "1m", "ytd", "1y", "5y", "10y", "all"];

export function UserPreferencesSection({ onUserUpdated, open, onToggle }: { onUserUpdated?: (() => Promise<void>) | undefined; open?: boolean; onToggle?: () => void }) {
  const { t } = useTranslation(["common", "settings"]);
  const preferences = useUserPreferences({ onUserUpdated });

  return (
    <Collapsible onToggle={onToggle} open={open} title={t("settings:preferences.title")}>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className="muted mb-1 block">{t("settings:preferences.dashboardSort")}</span>
          <select className="input" onChange={(event) => { preferences.setSortValue(event.target.value); }} value={preferences.sortValue}>
            {sortOptions.map((option) => (
              <option key={`${option.key}:${option.direction}`} value={`${option.key}:${option.direction}`}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted mb-1 block">{t("settings:preferences.watchlistSort")}</span>
          <select className="input" onChange={(event) => { preferences.setWatchlistSortValue(event.target.value); }} value={preferences.watchlistSortValue}>
            {watchlistSortOptions.map((option) => (
              <option key={`${option.key}:${option.direction}`} value={`${option.key}:${option.direction}`}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted mb-1 block">{t("settings:preferences.chartRange")}</span>
          <select className="input" onChange={(event) => { preferences.setRange(event.target.value as RangeKey); }} value={preferences.range}>
            {chartRanges.map((option) => (
              <option key={option} value={option}>{formatRangeLabel(option)}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted mb-1 block">{t("settings:preferences.projectionEndAge")}</span>
          <input
            className="input"
            inputMode="numeric"
            max={120}
            min={70}
            onChange={(event) => { preferences.setProjectionEndAge(Number(event.target.value)); }}
            type="number"
            value={preferences.projectionEndAge}
          />
          <span className="muted mt-1 block text-xs">{t("settings:preferences.projectionEndAgeHelp")}</span>
        </label>
        <label>
          <span className="muted mb-1 block">{t("settings:preferences.interfaceLanguage")}</span>
          <select className="input" onChange={(event) => { preferences.setLanguage(event.target.value as AppLanguage); }} value={preferences.language}>
            {languageOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.flag} {t(option.labelKey)}
              </option>
            ))}
          </select>
          <span className="muted mt-1 block text-xs">{t("settings:preferences.interfaceLanguageHelp")}</span>
        </label>
      </div>
      <PreferenceSwitch
        checked={preferences.advancedModeEnabled}
        details={t("settings:preferences.advancedModeDetails")}
        help={t("settings:preferences.advancedModeHelp")}
        onToggle={() => { preferences.setAdvancedModeEnabled((current) => !current); }}
        title={t("settings:preferences.advancedMode")}
      />
      <PreferenceSwitch
        checked={preferences.privacyModeEnabled}
        details={t("settings:preferences.privateModeDetails")}
        help={t("settings:preferences.privateModeHelp")}
        onToggle={() => { preferences.setPrivacyModeEnabled((current) => !current); }}
        title={t("settings:preferences.privateMode")}
      />
      <PreferenceSwitch
        checked={preferences.localPeaSearchEnabled}
        details={t("settings:preferences.localPeaSearchDetails")}
        help={t("settings:preferences.localPeaSearchHelp")}
        onToggle={() => { preferences.setLocalPeaSearchEnabled((current) => !current); }}
        title={t("settings:preferences.localPeaSearch")}
      />
      <PreferenceSwitch
        checked={preferences.assetNewsEnabled}
        details={t("settings:preferences.assetNewsDetails")}
        help={t("settings:preferences.assetNewsHelp")}
        onToggle={() => { preferences.setAssetNewsEnabled((current) => !current); }}
        title={t("settings:preferences.assetNews")}
      />
      <div className="rounded-md border border-line bg-ink p-3">
        <p className="font-semibold">{t("settings:preferences.newsLanguages")}</p>
        <p className="muted mt-1 text-sm">{t("settings:preferences.newsLanguagesHelp")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            { language: "fr" as const, label: "languages.fr" },
            { language: "en" as const, label: "languages.en" }
          ].map((option) => {
            const enabled = preferences.newsLanguages.includes(option.language);
            const locked = enabled && preferences.newsLanguages.length === 1;
            return (
              <label className="flex items-center gap-3 rounded-md border border-line bg-panel p-3" key={option.language}>
                <button
                  aria-checked={enabled}
                  className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${enabled ? "bg-mint" : "bg-panel2"} ${locked ? "opacity-70" : ""}`}
                  onClick={() => { preferences.toggleNewsLanguage(option.language); }}
                  role="switch"
                  title={locked ? t("settings:preferences.newsLanguageLocked") : t(option.label)}
                  type="button"
                >
                  <span className={`h-4 w-4 rounded-full bg-white transition ${enabled ? "translate-x-5" : ""}`} />
                </button>
                <span className="font-medium">{t(option.label)}</span>
              </label>
            );
          })}
        </div>
      </div>
      {preferences.toast && <Toast tone={preferences.toast.tone}>{preferences.toast.text}</Toast>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={preferences.me.loading} onClick={() => void preferences.save()} type="button">
          <Save size={17} />
          {t("common:actions.save")}
        </button>
      </div>
    </Collapsible>
  );
}
