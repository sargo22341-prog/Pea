import { SearchPanel } from "../components/SearchPanel";
import { useAsync } from "../hooks/useAsync";
import { useEnrichedSearch } from "../hooks/useEnrichedSearch";
import { api } from "../lib/api";

export function SearchPage() {
  const me = useAsync(() => api.me(), []);
  const search = useEnrichedSearch({ localPeaSearchEnabled: me.data?.user?.localPeaSearchEnabled });

  return (
    <SearchPanel
      error={search.error}
      loading={search.loading}
      localPeaSearchEnabled={me.data?.user?.localPeaSearchEnabled}
      onQueryChange={search.setQuery}
      onToggleWatchlist={(item) => void search.toggleWatchlist(item)}
      query={search.query}
      results={search.results}
    />
  );
}
