/**
 * Role du fichier : composer la page /search avec la recherche d'actifs et les
 * classements Yahoo Finance du jour.
 */

import { SearchPanel } from "../components/search/SearchPanel";
import { TopMoversSection } from "../components/search/TopMoversSection";
import { useAsync } from "../hooks/useAsync";
import { useEnrichedSearch } from "../hooks/useEnrichedSearch";
import { api } from "../lib/api";

/** Page de recherche principale, protegee par les appels API authentifies. */
export function SearchPage() {
  const me = useAsync(() => api.me(), []);
  const topMovers = useAsync((signal) => api.topAndLosers(signal), []);
  const search = useEnrichedSearch({ localPeaSearchEnabled: me.data?.user?.localPeaSearchEnabled });

  return (
    <div className="space-y-8">
      <SearchPanel
        error={search.error}
        loading={search.loading}
        localPeaSearchEnabled={me.data?.user?.localPeaSearchEnabled}
        onQueryChange={search.setQuery}
        onToggleWatchlist={(item) => void search.toggleWatchlist(item)}
        query={search.query}
        results={search.results}
      />
      <TopMoversSection data={topMovers.data} error={topMovers.error} loading={topMovers.loading} />
    </div>
  );
}
