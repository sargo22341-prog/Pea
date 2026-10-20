import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Collapsible } from "../../../components/common/feedback";
import { PreferenceSwitch } from "../../../components/common/forms/PreferenceSwitch";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";

/**
 * Réglage de l'ajout automatique des dividendes : désactivé, chaque dividende se confirme ; activé,
 * seuls les dividendes sûrs sont enregistrés sans clic, les autres restent à confirmer. Le backend
 * reste seul juge de ce qui est « sûr ».
 */
export function DividendSettingsSection({ open, onToggle }: { open?: boolean; onToggle?: () => void }) {
  const { t } = useTranslation(["settings", "errors"]);
  const settings = useAsync((signal) => api.dividendSettings(signal), "dividend-settings");
  const [saved, setSaved] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoAccept = saved ?? settings.data?.autoAccept ?? false;

  async function toggle() {
    setError(null);
    try {
      setSaved((await api.updateDividendSettings({ autoAccept: !autoAccept })).autoAccept);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("errors:unknown"));
    }
  }

  return (
    <Collapsible onToggle={onToggle} open={open} title={t("settings:dividends.title")}>
      <PreferenceSwitch
        checked={autoAccept}
        details={(
          <>
            <span className="block">{t("settings:dividends.autoAcceptDetails")}</span>
            <span className="mt-1 block">{t("settings:dividends.autoAcceptCorrection")}</span>
          </>
        )}
        help={t("settings:dividends.autoAcceptHelp")}
        onToggle={() => void toggle()}
        title={t("settings:dividends.autoAccept")}
      />
      {settings.error ?? error ? <p className="mt-2 text-sm text-coral" role="alert">{settings.error ?? error}</p> : null}
    </Collapsible>
  );
}
