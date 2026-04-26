import type { DashboardSortKey, RangeKey, SortDirection } from "@pea/shared";
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
  const [toast, setToast] = useState<SettingsToast | null>(null);

  useEffect(() => {
    const user = me.data?.user;
    if (!user) return;
    setSortValue(`${user.dashboardDefaultSortKey}:${user.dashboardDefaultSortDirection}`);
    setRange(user.defaultChartRange);
    setLocalPeaSearchEnabled(user.localPeaSearchEnabled);
    setAssetNewsEnabled(user.assetNewsEnabled);
  }, [me.data?.user]);

  async function save() {
    const [dashboardDefaultSortKey, dashboardDefaultSortDirection] = sortValue.split(":") as [DashboardSortKey, SortDirection];
    setToast(null);
    try {
      await api.updateMe({ dashboardDefaultSortKey, dashboardDefaultSortDirection, defaultChartRange: range, localPeaSearchEnabled, assetNewsEnabled });
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
    range,
    save,
    setAssetNewsEnabled,
    setLocalPeaSearchEnabled,
    setRange,
    setSortValue,
    sortValue,
    toast
  };
}
