import { SCREENER_ASSET_TYPES, type ScreenerFilters, type ScreenerOptions } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { DetailsToggle } from "../../../components/common/disclosure/DetailsToggle";
import { activeFilterCount, fromCanonical, toCanonical } from "../screener-config";

type NumericKey = "minDividendYield" | "maxTrailingPE" | "minTrailingPE" | "minMarketCap" | "maxMarketCap" | "minChange52w" | "maxChange52w" | "maxDistanceFromHigh";
type Update = <K extends keyof ScreenerFilters>(name: K, value: ScreenerFilters[K]) => void;

/** Échelle d'affichage : pourcentages saisis en %, capitalisations en milliards. */
const PERCENT = 100;
const BILLIONS = 1e-9;

function NumberFilter({ name, label, scale = 1, filters, onChange }: { name: NumericKey; label: string; scale?: number; filters: ScreenerFilters; onChange: Update }) {
  return (
    <label className="block space-y-1 text-xs text-slate-400">
      <span>{label}</span>
      <input
        className="input h-9"
        inputMode="decimal"
        min={0}
        onChange={(event) => { onChange(name, toCanonical(event.target.value, scale)); }}
        type="number"
        value={fromCanonical(filters[name], scale)}
      />
    </label>
  );
}

function SelectFilter({ label, value, values, allLabel, onChange }: { label: string; value: string | undefined; values: readonly string[]; allLabel: string; onChange: (value: string | undefined) => void }) {
  return (
    <label className="block space-y-1 text-xs text-slate-400">
      <span>{label}</span>
      <select className="input h-9" onChange={(event) => { onChange(event.target.value || undefined); }} value={value ?? ""}>
        <option value="">{allLabel}</option>
        {values.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
  );
}

/** Niveau 1 : PEA, secteur, rendement minimum, PER maximum ; le reste sous « Plus de filtres ». */
export function ScreenerFilterPanel({ filters, options, onChange }: { filters: ScreenerFilters; options: ScreenerOptions; onChange: Update }) {
  const { t } = useTranslation("screener");
  const more = activeFilterCount({ ...filters, sector: undefined, minDividendYield: undefined, maxTrailingPE: undefined });

  return (
    <section className="card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <button
          aria-pressed={filters.peaOnly === true}
          className={`inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-semibold transition ${filters.peaOnly ? "border-mint/50 bg-mint/10 text-mint" : "border-line text-slate-400 hover:text-slate-200"}`}
          onClick={() => { onChange("peaOnly", !filters.peaOnly); }}
          type="button"
        >
          {t("filters.peaOnly")}
        </button>
        <SelectFilter allLabel={t("filters.allSectors")} label={t("filters.sector")} onChange={(value) => { onChange("sector", value); }} value={filters.sector} values={options.sectors} />
        <NumberFilter filters={filters} label={t("filters.minDividendYield")} name="minDividendYield" onChange={onChange} scale={PERCENT} />
        <NumberFilter filters={filters} label={t("filters.maxTrailingPE")} name="maxTrailingPE" onChange={onChange} />
      </div>
      <DetailsToggle label={more ? t("filters.moreActive", { count: more }) : t("filters.more")} storageKey="screener.moreFilters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block space-y-1 text-xs text-slate-400">
            <span>{t("filters.assetType")}</span>
            <select className="input h-9" onChange={(event) => { onChange("assetType", SCREENER_ASSET_TYPES.find((type) => type === event.target.value)); }} value={filters.assetType ?? "all"}>
              {SCREENER_ASSET_TYPES.map((type) => <option key={type} value={type}>{t(`assetTypes.${type}`)}</option>)}
            </select>
          </label>
          <SelectFilter allLabel={t("filters.allCountries")} label={t("filters.country")} onChange={(value) => { onChange("country", value); }} value={filters.country} values={options.countries} />
          <NumberFilter filters={filters} label={t("filters.minTrailingPE")} name="minTrailingPE" onChange={onChange} />
          <NumberFilter filters={filters} label={t("filters.maxDistanceFromHigh")} name="maxDistanceFromHigh" onChange={onChange} scale={PERCENT} />
          <NumberFilter filters={filters} label={t("filters.minMarketCap")} name="minMarketCap" onChange={onChange} scale={BILLIONS} />
          <NumberFilter filters={filters} label={t("filters.maxMarketCap")} name="maxMarketCap" onChange={onChange} scale={BILLIONS} />
          <NumberFilter filters={filters} label={t("filters.minChange52w")} name="minChange52w" onChange={onChange} scale={PERCENT} />
          <NumberFilter filters={filters} label={t("filters.maxChange52w")} name="maxChange52w" onChange={onChange} scale={PERCENT} />
        </div>
      </DetailsToggle>
    </section>
  );
}
