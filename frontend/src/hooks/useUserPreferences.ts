import type { DashboardSortKey, NewsLanguage, RangeKey, SortDirection } from "@pea/shared";
import { useEffect, useState } from "react";
import type { SettingsToast } from "../components/settings/SettingsSection";
import { api } from "../lib/api";
import { useAsync } from "./useAsync";

export function useUserPreferences({ onUserUpdated }: { onUserUpdated?: () => Promise<void> }) {
  const me = useAsync(() => api.me(), []);
  const [sortValue, setSortValue] = useState("name:asc");
  const [range, setRange] = useState<RangeKey>("1d");
  const [localPeaSearchEnabled, setLocalPeaSearchEnabled] = useState(false);
  const [assetNewsEnabled, setAssetNewsEnabled] = useState(true);
  const [newsLanguages, setNewsLanguages] = useState<NewsLanguage[]>(["fr"]);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  useEffect(() => {
    const user = me.data?.user;
    if (!user) return;
    setSortValue(`${user.dashboardDefaultSortKey}:${user.dashboardDefaultSortDirection}`);
    setRange(user.defaultChartRange);
    setLocalPeaSearchEnabled(user.localPeaSearchEnabled);
    setAssetNewsEnabled(user.assetNewsEnabled);
    setNewsLanguages(user.newsLanguages?.length ? user.newsLanguages : ["fr"]);
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
    setToast(null);
    try {
      await api.updateMe({ dashboardDefaultSortKey, dashboardDefaultSortDirection, defaultChartRange: range, localPeaSearchEnabled, assetNewsEnabled, newsLanguages });
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
    range,
    save,
    setAssetNewsEnabled,
    setLocalPeaSearchEnabled,
    setRange,
    setSortValue,
    sortValue,
    toggleNewsLanguage,
    toast
  };
}
