import type { User } from "@pea/shared";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { SearchPanel } from "./components/SearchPanel";
import { TopMoversSection } from "./components/TopMoversSection";
import { useEnrichedSearch } from "../../hooks/useEnrichedSearch";

/** Page de recherche principale, protegee par les appels API authentifies. */
export function SearchPage({ user }: { user: User }) {
  const { t } = useTranslation("navigation");

  useEffect(() => {
    document.title = `${t("search")} | PEA Portfolio`;
    return () => {
      document.title = "PEA Portfolio";
    };
  }, [t]);

  // L'utilisateur est deja charge par App : inutile de rappeler /api/auth/me.
  const search = useEnrichedSearch({ localPeaSearchEnabled: user.localPeaSearchEnabled });

  return (
    <div className="space-y-8">
      <SearchPanel
        error={search.error}
        loading={search.loading}
        localPeaSearchEnabled={user.localPeaSearchEnabled}
        onQueryChange={search.setQuery}
        onToggleWatchlist={(item) => void search.toggleWatchlist(item)}
        query={search.query}
        results={search.results}
      />
      <TopMoversSection />
    </div>
  );
}
