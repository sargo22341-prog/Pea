import type { DashboardSortKey, NewsLanguage, RangeKey, SortDirection, WatchlistSortKey } from "@pea/shared";
import { useEffect, useState } from "react";
import type { SettingsToast } from "../../../components/common/feedback";
import { api } from "../../../lib/api";
import { useAsync } from "../../../hooks/useAsync";

export function useUserPreferences({ onUserUpdated }: { onUserUpdated?: () => Promise<void> }) {
  const me = useAsync(() => api.me(), []);
  const [sortValue, setSortValue] = useState("name:asc");
  const [watchlistSortValue, setWatchlistSortValue] = useState("name:asc");
  const [range, setRange] = useState<RangeKey>("1d");
  const [localPeaSearchEnabled, setLocalPeaSearchEnabled] = useState(false);
  const [assetNewsEnabled, setAssetNewsEnabled] = useState(true);
  const [newsLanguages, setNewsLanguages] = useState<NewsLanguage[]>(["fr"]);
  const [privacyModeEnabled, setPrivacyModeEnabled] = useState(false);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  useEffect(() => {
    const user = me.data?.user;
    if (!user) return;
    setSortValue(`${user.dashboardDefaultSortKey}:${user.dashboardDefaultSortDirection}`);
    setWatchlistSortValue(`${user.watchlistDefaultSortKey}:${user.watchlistDefaultSortDirection}`);
    setRange(user.defaultChartRange);
    setLocalPeaSearchEnabled(user.localPeaSearchEnabled);
    setAssetNewsEnabled(user.assetNewsEnabled);
    setNewsLanguages(user.newsLanguages?.length ? user.newsLanguages : ["fr"]);
    setPrivacyModeEnabled(user.privacyModeEnabled);
  }, [me.data?.user]);

  function toggleNewsLanguage(language: NewsLanguage) {
    setNewsLanguages((current) => {
      if (current.includes(language)) {
        return current.length === 1 ? current : current.filter((item) => item !== language);
      }
      return [...current, language];
    });
  }

  async function save() {
    const [dashboardDefaultSortKey, dashboardDefaultSortDirection] = sortValue.split(":") as [DashboardSortKey, SortDirection];
    const [watchlistDefaultSortKey, watchlistDefaultSortDirection] = watchlistSortValue.split(":") as [WatchlistSortKey, SortDirection];
    setToast(null);
    try {
      await api.updateMe({ dashboardDefaultSortKey, dashboardDefaultSortDirection, watchlistDefaultSortKey, watchlistDefaultSortDirection, defaultChartRange: range, localPeaSearchEnabled, assetNewsEnabled, newsLanguages, privacyModeEnabled });
      setToast({ tone: "success", text: "Preferences enregistrees." });
      await me.reload();
      await onUserUpdated?.();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : "Enregistrement impossible." });
    }
  }

  return {
    assetNewsEnabled,
    localPeaSearchEnabled,
    me,
    newsLanguages,
    privacyModeEnabled,
    range,
    save,
    setAssetNewsEnabled,
    setLocalPeaSearchEnabled,
    setPrivacyModeEnabled,
    setRange,
    setSortValue,
    setWatchlistSortValue,
    sortValue,
    toggleNewsLanguage,
    toast,
    watchlistSortValue
  };
}
