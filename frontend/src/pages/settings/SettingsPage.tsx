import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AccountSettingsSection } from "./components/AccountSettingsSection";
import { AssetIconsSettingsSection } from "./components/AssetIconsSettingsSection";
import { CsvImportSection } from "./components/CsvImportSection";
import { ImportAvisOperesPdf } from "./components/ImportAvisOperesPdf";
import { Collapsible } from "../../components/common/feedback";
import { ServerSettingsSection } from "../../components/common/ServerSettings";
import { UserPreferencesSection } from "./components/UserPreferencesSection";
import { api } from "../../lib/api";

export function SettingsPage({ onUserUpdated }: { onUserUpdated?: () => Promise<void> }) {
  const { t } = useTranslation(["navigation", "settings"]);
  useEffect(() => {
    document.title = `${t("settings:title")} | PEA Portfolio`;
    return () => {
      document.title = "PEA Portfolio";
    };
  }, [t]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("settings:title")}</h1>
        <p className="muted">{t("settings:subtitle")}</p>
      </div>
      <ServerSettingsSection />
      <AccountSettingsSection />
      <UserPreferencesSection onUserUpdated={onUserUpdated} />
      <AssetIconsSettingsSection />
      <Collapsible title={t("settings:imports.boursorama")}>
        <CsvImportSection />
        <ImportAvisOperesPdf />
      </Collapsible>
      <LogoutSection />
    </div>
  );
}

function LogoutSection() {
  const { t } = useTranslation("navigation");
  async function logout() {
    await api.logout();
    window.location.assign("/");
  }

  return (
    <section className="flex justify-end">
      <button className="btn-ghost text-coral" onClick={() => void logout()} type="button">
        {t("logout")}
      </button>
    </section>
  );
}
