import { useEffect } from "react";
import { DataConstructionSection } from "./components/DataConstructionSection";
import { MarketDataActionsSection } from "./components/MarketDataActionsSection";
import { RuntimeHealthSection } from "./components/RuntimeHealthSection";
import { TrackedMarketsSection } from "./components/TrackedMarketsSection";
import { UserManagementSection } from "./components/UserManagementSection";
import { YahooUsageSection } from "./components/YahooUsageSection";

export function AdminPage() {
  useEffect(() => {
    document.title = "Administration | PEA Portfolio";
    return () => {
      document.title = "PEA Portfolio";
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Administration serveur</h1>
        <p className="muted">Utilisateurs, diagnostics Yahoo Finance, marches suivis et actions de maintenance.</p>
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
