import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SearchPanel } from "./components/SearchPanel";
import { TopMoversSection } from "./components/TopMoversSection";
import { useAsync } from "../../hooks/useAsync";
import { useEnrichedSearch } from "../../hooks/useEnrichedSearch";
import { api } from "../../lib/api";

/** Page de recherche principale, protegee par les appels API authentifies. */
export function SearchPage() {
  const { t } = useTranslation("navigation");

  useEffect(() => {
    document.title = `${t("search")} | PEA Portfolio`;
    return () => {
      document.title = "PEA Portfolio";
    };
  }, [t]);

  const me = useAsync(() => api.me());
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
