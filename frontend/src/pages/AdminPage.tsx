import { useEffect } from "react";
import { DataConstructionSection } from "./admin/components/DataConstructionSection";
import { MarketDataActionsSection } from "./admin/components/MarketDataActionsSection";
import { TrackedMarketsSection } from "./admin/components/TrackedMarketsSection";
import { YahooUsageSection } from "./admin/components/YahooUsageSection";

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
