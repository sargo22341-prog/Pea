import { useEffect } from "react";
import { SearchPanel } from "./search/components/SearchPanel";
import { TopMoversSection } from "./search/components/TopMoversSection";
import { useAsync } from "../hooks/useAsync";
import { useEnrichedSearch } from "../hooks/useEnrichedSearch";
import { api } from "../lib/api";

/** Page de recherche principale, protegee par les appels API authentifies. */
export function SearchPage() {

  useEffect(() => {
    document.title = "Chercher | PEA Portfolio";
    return () => {
      document.title = "PEA Portfolio";
    };
  }, []);

  const me = useAsync(() => api.me(), []);
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
      <TopMoversSection />
    </div>
  );
}
