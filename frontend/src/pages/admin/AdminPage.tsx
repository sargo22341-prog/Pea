import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { DataConstructionSection } from "./components/DataConstructionSection";
import { MarketDataActionsSection } from "./components/MarketDataActionsSection";
import { RuntimeHealthSection } from "./components/RuntimeHealthSection";
import { TrackedMarketsSection } from "./components/TrackedMarketsSection";
import { UserManagementSection } from "./components/UserManagementSection";
import { YahooUsageSection } from "./components/YahooUsageSection";

export function AdminPage() {
  const { t } = useTranslation("common");
  useEffect(() => {
    document.title = `${t("admin.title")} | PEA Portfolio`;
    return () => {
      document.title = "PEA Portfolio";
    };
  }, [t]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
        <p className="muted">{t("admin.subtitle")}</p>
      </div>
      <UserManagementSection />
      <DataConstructionSection />
      <RuntimeHealthSection />
      <YahooUsageSection />
      <TrackedMarketsSection />
      <MarketDataActionsSection />
    </div>
  );
}
