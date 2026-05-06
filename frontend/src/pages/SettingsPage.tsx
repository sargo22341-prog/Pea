import { useEffect } from "react";
import { AccountSettingsSection } from "../components/settings/AccountSettingsSection";
import { AssetIconsSettingsSection } from "../components/settings/AssetIconsSettingsSection";
import { CsvImportSection } from "../components/settings/CsvImportSection";
import { DataConstructionSection } from "../components/settings/DataConstructionSection";
import { ImportAvisOperesPdf } from "../components/settings/ImportAvisOperesPdf";
import { MarketDataActionsSection } from "../components/settings/MarketDataActionsSection";
import { Collapsible } from "../components/settings/SettingsSection";
import { TrackedMarketsSection } from "../components/settings/TrackedMarketsSection";
import { UserPreferencesSection } from "../components/settings/UserPreferencesSection";
import { api } from "../lib/api";

export function SettingsPage({ onUserUpdated }: { onUserUpdated?: () => Promise<void> }) {

    useEffect(() => {
      document.title = "Parametres | PEA Portfolio";
      return () => {
        document.title = "PEA Portfolio";
      };
    }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Parametres</h1>
        <p className="muted">Compte, preferences, icones et import Boursorama.</p>
      </div>
      <DataConstructionSection />
      <AccountSettingsSection />
      <UserPreferencesSection onUserUpdated={onUserUpdated} />
      <TrackedMarketsSection />
      <MarketDataActionsSection />
      <AssetIconsSettingsSection />
      <Collapsible title="Import Boursorama">
        <CsvImportSection />
        <ImportAvisOperesPdf />
      </Collapsible>
      <LogoutSection />
    </div>
  );
}

function LogoutSection() {
  async function logout() {
    await api.logout();
    window.location.assign("/");
  }

  return (
    <section className="flex justify-end">
      <button className="btn-ghost text-coral" onClick={() => void logout()} type="button">
        Se deconnecter
      </button>
    </section>
  );
}
