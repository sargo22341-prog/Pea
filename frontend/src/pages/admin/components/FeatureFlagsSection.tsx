import type { AppFeatureFlag, AppFeatureKey } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Collapsible, Toast, type SettingsToast } from "../../../components/common/feedback";
import { PreferenceSwitch } from "../../../components/common/forms/PreferenceSwitch";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";
import { formatDateTime } from "./yahoo-usage/yahooUsageUtils";

/**
 * Interrupteurs des fonctionnalités coûteuses en appels Yahoo. Une fonctionnalité désactivée ne
 * déclenche plus aucun appel et son bloc disparaît des fiches ; le suivi d'usage mesure son coût.
 */
export function FeatureFlagsSection({ open, onToggle, onChanged }: { open?: boolean; onToggle?: () => void; onChanged?: (() => Promise<void>) | undefined }) {
  const { t } = useTranslation("common");
  const flags = useAsync(() => api.featureFlags());
  const [saving, setSaving] = useState<AppFeatureKey | null>(null);
  const [toast, setToast] = useState<SettingsToast | null>(null);

  async function toggle(flag: AppFeatureFlag) {
    setSaving(flag.key);
    setToast(null);
    try {
      await api.updateFeatureFlags({ [flag.key]: !flag.enabled });
      await flags.reload();
      await onChanged?.();
    } catch (error) {
      setToast({ tone: "error", text: error instanceof Error ? error.message : t("admin.features.saveError") });
    } finally {
      setSaving(null);
    }
  }

  return (
    <Collapsible onToggle={onToggle} open={open} title={t("admin.features.title")}>
      <p className="muted">{t("admin.features.help")}</p>
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
      {flags.error ? <p className="text-coral">{flags.error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {(flags.data ?? []).map((flag) => (
          <div aria-busy={saving === flag.key} key={flag.key}>
            <PreferenceSwitch
              checked={flag.enabled}
              details={flag.updatedAt ? t("admin.features.updated", { date: formatDateTime(flag.updatedAt), user: flag.updatedBy ?? "-" }) : t(flag.defaultEnabled ? "admin.features.defaultOn" : "admin.features.defaultOff")}
              help={t(`admin.features.keys.${flag.key}Help`)}
              onToggle={() => { if (saving === null) void toggle(flag); }}
              title={t(`admin.features.keys.${flag.key}`)}
            />
          </div>
        ))}
      </div>
    </Collapsible>
  );
}
