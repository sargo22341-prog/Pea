import type { DashboardSortKey, RangeKey, SortDirection } from "@pea/shared";
import { Save } from "lucide-react";
import { useUserPreferences } from "../../hooks/useUserPreferences";
import { formatRangeLabel } from "../../lib/format";
import { Collapsible, Toast } from "./SettingsSection";

const sortOptions: Array<{ label: string; key: DashboardSortKey; direction: SortDirection }> = [
  { label: "Nom A -> Z", key: "name", direction: "asc" },
  { label: "Nom Z -> A", key: "name", direction: "desc" },
  { label: "Valeur marche croissante", key: "currentMarketValue", direction: "asc" },
  { label: "Valeur marche decroissante", key: "currentMarketValue", direction: "desc" },
  { label: "Variation % croissante", key: "intervalPerformancePercent", direction: "asc" },
  { label: "Variation % decroissante", key: "intervalPerformancePercent", direction: "desc" }
];

const chartRanges: RangeKey[] = ["1d", "1w", "1m", "ytd", "1y", "5y", "10y", "all"];

export function UserPreferencesSection({ onUserUpdated }: { onUserUpdated?: () => Promise<void> }) {
  const preferences = useUserPreferences({ onUserUpdated });

  return (
    <Collapsible title="Mes preferences">
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className="muted mb-1 block">Tri par defaut du dashboard</span>
          <select className="input" onChange={(event) => preferences.setSortValue(event.target.value)} value={preferences.sortValue}>
            {sortOptions.map((option) => (
              <option key={`${option.key}:${option.direction}`} value={`${option.key}:${option.direction}`}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted mb-1 block">Intervalle par defaut des graphiques</span>
          <select className="input" onChange={(event) => preferences.setRange(event.target.value as RangeKey)} value={preferences.range}>
            {chartRanges.map((option) => (
              <option key={option} value={option}>{formatRangeLabel(option)}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-start gap-3 rounded-md border border-line bg-ink p-3">
        <button
          aria-checked={preferences.localPeaSearchEnabled}
          className={`mt-1 flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${preferences.localPeaSearchEnabled ? "bg-mint" : "bg-panel2"}`}
          onClick={() => preferences.setLocalPeaSearchEnabled((current) => !current)}
          role="switch"
          type="button"
        >
          <span className={`h-4 w-4 rounded-full bg-white transition ${preferences.localPeaSearchEnabled ? "translate-x-5" : ""}`} />
        </button>
        <span>
          <span className="block font-semibold">Utiliser la recherche locale PEA</span>
          <span className="muted block">Utilise la liste locale d'actions et ETF PEA pour accelerer la recherche et eviter les appels API.</span>
          <span className="mt-2 block text-sm text-slate-300">
            Si cette option est activee, seules les valeurs eligibles PEA seront proposees. Pour rechercher toutes les actions et ETF, desactivez cette option.
          </span>
        </span>
      </label>
      <label className="flex items-start gap-3 rounded-md border border-line bg-ink p-3">
        <button
          aria-checked={preferences.assetNewsEnabled}
          className={`mt-1 flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${preferences.assetNewsEnabled ? "bg-mint" : "bg-panel2"}`}
          onClick={() => preferences.setAssetNewsEnabled((current) => !current)}
          role="switch"
          type="button"
        >
          <span className={`h-4 w-4 rounded-full bg-white transition ${preferences.assetNewsEnabled ? "translate-x-5" : ""}`} />
        </button>
        <span>
          <span className="block font-semibold">Afficher les articles Yahoo Finance</span>
          <span className="muted block">Affiche les articles lies au ticker sur la page detail d'un actif.</span>
          <span className="mt-2 block text-sm text-slate-300">
            Si cette option est desactivee, aucun bloc article n'est affiche et aucun appel news n'est effectue cote backend.
          </span>
        </span>
      </label>
      {/* Masquage des chiffres du portefeuille */}
      <label className="flex items-start gap-3 rounded-md border border-line bg-ink p-3">
        <button
          aria-checked={preferences.privacyModeEnabled}
          className={`mt-1 flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${preferences.privacyModeEnabled ? "bg-mint" : "bg-panel2"}`}
          onClick={() => preferences.setPrivacyModeEnabled((current) => !current)}
          role="switch"
          type="button"
        >
          <span className={`h-4 w-4 rounded-full bg-white transition ${preferences.privacyModeEnabled ? "translate-x-5" : ""}`} />
        </button>
        <span>
          <span className="block font-semibold">Mode prive</span>
          <span className="muted block">Masque les chiffres lies a votre portefeuille sur toutes les pages.</span>
          <span className="mt-2 block text-sm text-slate-300">
            Les donnees de marche (cours, variations journalieres) restent visibles. Seuls les montants personnels (valeur totale, dividendes, frais, performances) sont remplaces par des points.
          </span>
        </span>
      </label>
      <div className="rounded-md border border-line bg-ink p-3">
        <p className="font-semibold">Langues des actualites</p>
        <p className="muted mt-1 text-sm">Gardez au moins une langue activee pour les articles.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            { language: "fr" as const, label: "Francais" },
            { language: "en" as const, label: "Anglais" }
          ].map((option) => {
            const enabled = preferences.newsLanguages.includes(option.language);
            const locked = enabled && preferences.newsLanguages.length === 1;
            return (
              <label className="flex items-center gap-3 rounded-md border border-line bg-panel p-3" key={option.language}>
                <button
                  aria-checked={enabled}
                  className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${enabled ? "bg-mint" : "bg-panel2"} ${locked ? "opacity-70" : ""}`}
                  onClick={() => preferences.toggleNewsLanguage(option.language)}
                  role="switch"
                  title={locked ? "Au moins une langue doit rester activee" : option.label}
                  type="button"
                >
                  <span className={`h-4 w-4 rounded-full bg-white transition ${enabled ? "translate-x-5" : ""}`} />
                </button>
                <span className="font-medium">{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
      {preferences.toast && <Toast tone={preferences.toast.tone}>{preferences.toast.text}</Toast>}
      <div className="flex justify-end">
        <button className="btn-primary" disabled={preferences.me.loading} onClick={() => void preferences.save()} type="button">
          <Save size={17} />
          Enregistrer
        </button>
      </div>
    </Collapsible>
  );
}
