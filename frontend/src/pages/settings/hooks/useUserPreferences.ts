import type { AppLanguage, DashboardSortKey, NewsLanguage, RangeKey, SortDirection, WatchlistSortKey } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsToast } from "../../../components/common/feedback";
import { api } from "../../../lib/api";
import { useAsync } from "../../../hooks/useAsync";
import { changeAppLanguage } from "../../../i18n";

export function useUserPreferences({ onUserUpdated }: { onUserUpdated?: (() => Promise<void>) | undefined }) {
  const { t } = useTranslation(["settings"]);
  const me = useAsync(() => api.me());
  const [sortValue, setSortValue] = useState("name:asc");
  const [watchlistSortValue, setWatchlistSortValue] = useState("name:asc");
  const [range, setRange] = useState<RangeKey>("1d");
  const [projectionEndAge, setProjectionEndAge] = useState(90);
  const [localPeaSearchEnabled, setLocalPeaSearchEnabled] = useState(false);
  const [assetNewsEnabled, setAssetNewsEnabled] = useState(true);
  const [newsLanguages, setNewsLanguages] = useState<NewsLanguage[]>(["fr"]);
  const [language, setLanguage] = useState<AppLanguage>("fr");
  const [privacyModeEnabled, setPrivacyModeEnabled] = useState(false);
  const [advancedModeEnabled, setAdvancedModeEnabled] = useState(false);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  // Profil charge ou recharge : les champs du formulaire sont recopies pendant le rendu.
  const loadedUser = me.data?.user;
  const [syncedUser, setSyncedUser] = useState<typeof loadedUser>(undefined);
  if (loadedUser && loadedUser !== syncedUser) {
    const user = loadedUser;
    setSyncedUser(user);
    setSortValue(`${user.dashboardDefaultSortKey}:${user.dashboardDefaultSortDirection}`);
    setWatchlistSortValue(`${user.watchlistDefaultSortKey}:${user.watchlistDefaultSortDirection}`);
    setRange(user.defaultChartRange);
    setProjectionEndAge(user.projectionEndAge);
    setLocalPeaSearchEnabled(user.localPeaSearchEnabled);
    setAssetNewsEnabled(user.assetNewsEnabled);
    setNewsLanguages(user.newsLanguages.length ? user.newsLanguages : ["fr"]);
    setLanguage(user.language);
    setPrivacyModeEnabled(user.privacyModeEnabled);
    setAdvancedModeEnabled(user.advancedModeEnabled);
  }

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
      await api.updateMe({ dashboardDefaultSortKey, dashboardDefaultSortDirection, watchlistDefaultSortKey, watchlistDefaultSortDirection, defaultChartRange: range, projectionEndAge, localPeaSearchEnabled, assetNewsEnabled, newsLanguages, language, privacyModeEnabled, advancedModeEnabled });
      await changeAppLanguage(language);
      setToast({ tone: "success", text: t("settings:preferences.saved") });
      await me.reload();
      await onUserUpdated?.();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("settings:preferences.saveError") });
    }
  }

  return {
    advancedModeEnabled,
    assetNewsEnabled,
    localPeaSearchEnabled,
    language,
    me,
    newsLanguages,
    privacyModeEnabled,
    projectionEndAge,
    range,
    save,
    setAdvancedModeEnabled,
    setAssetNewsEnabled,
    setLanguage,
    setLocalPeaSearchEnabled,
    setPrivacyModeEnabled,
    setProjectionEndAge,
    setRange,
    setSortValue,
    setWatchlistSortValue,
    sortValue,
    toggleNewsLanguage,
    toast,
    watchlistSortValue
  };
}
