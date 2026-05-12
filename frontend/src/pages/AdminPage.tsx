import { useEffect } from "react";
import { DataConstructionSection } from "../components/admin/DataConstructionSection";
import { MarketDataActionsSection } from "../components/admin/MarketDataActionsSection";
import { TrackedMarketsSection } from "../components/admin/TrackedMarketsSection";
import { YahooUsageSection } from "../components/admin/YahooUsageSection";

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
        <p className="muted">Diagnostics Yahoo Finance, marches suivis et actions de maintenance.</p>
      </div>
      <DataConstructionSection />
      <YahooUsageSection />
      <TrackedMarketsSection />
      <MarketDataActionsSection />
    </div>
  );
}
