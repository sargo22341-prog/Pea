import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DataConstructionSection } from "./components/DataConstructionSection";
import { MarketDataActionsSection } from "./components/MarketDataActionsSection";
import { RuntimeHealthSection } from "./components/RuntimeHealthSection";
import { TrackedMarketsSection } from "./components/TrackedMarketsSection";
import { UserManagementSection } from "./components/UserManagementSection";
import { YahooUsageSection } from "./components/YahooUsageSection";

export function AdminPage() {
  const { t } = useTranslation("common");
  const [openSection, setOpenSection] = useState<string | null>(null);

  function toggleSection(section: string) {
    setOpenSection((current) => current === section ? null : section);
  }

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
      <UserManagementSection onToggle={() => toggleSection("users")} open={openSection === "users"} />
      <DataConstructionSection />
      <RuntimeHealthSection onToggle={() => toggleSection("runtime")} open={openSection === "runtime"} />
      <YahooUsageSection onToggle={() => toggleSection("yahooUsage")} open={openSection === "yahooUsage"} />
      <TrackedMarketsSection onToggle={() => toggleSection("markets")} open={openSection === "markets"} />
      <MarketDataActionsSection onToggle={() => toggleSection("actions")} open={openSection === "actions"} />
    </div>
  );
}
