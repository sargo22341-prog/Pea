import { useEffect } from "react";
import type { User } from "@pea/shared";
import { Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { AccountSettingsSection } from "./components/AccountSettingsSection";
import { AssetIconsSettingsSection } from "./components/AssetIconsSettingsSection";
import { CsvImportSection } from "./components/CsvImportSection";
import { ImportAvisOperesPdf } from "./components/ImportAvisOperesPdf";
import { Collapsible } from "../../components/common/feedback";
import { UserPreferencesSection } from "./components/UserPreferencesSection";
import { api } from "../../lib/api";

export function SettingsPage({ onUserUpdated, user }: { onUserUpdated?: () => Promise<void>; user: User }) {
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
      <AccountSettingsSection />
      <UserPreferencesSection onUserUpdated={onUserUpdated} />
      <AssetIconsSettingsSection />
      <Collapsible title="Import Boursorama">
        <CsvImportSection />
        <ImportAvisOperesPdf />
      </Collapsible>
      {user.role === "admin" && <AdminLinkSection />}
      <LogoutSection />
    </div>
  );
}

function AdminLinkSection() {
  return (
    <section className="flex justify-end">
      <Link className="btn-primary gap-2" to="/admin">
        <Shield size={16} />
        Administration serveur
      </Link>
    </section>
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
