import { SCREENER_PRESET_NAME_MAX_LENGTH, type ScreenerFilters, type ScreenerPreset } from "@pea/shared";
import { Save, X } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { BUILT_IN_PRESETS } from "../screener-config";

const chipClass = "inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-xs font-semibold text-slate-300 transition hover:border-sky hover:text-sky";

/** Préréglages intégrés et filtres enregistrés ; enregistrement des filtres courants sous un nom. */
export function ScreenerPresetBar({
  presets,
  error,
  onApply,
  onSave,
  onDelete
}: {
  presets: readonly ScreenerPreset[];
  error: string | null;
  onApply: (filters: ScreenerFilters) => void;
  onSave: (name: string) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
}) {
  const { t } = useTranslation("screener");
  const [name, setName] = useState("");

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (await onSave(trimmed)) setName("");
  }

  return (
    <div className="space-y-2">
      <div aria-label={t("presets.label")} className="flex flex-wrap items-center gap-2" role="group">
        {BUILT_IN_PRESETS.map((preset) => (
          <button className={chipClass} key={preset.key} onClick={() => { onApply(preset.filters); }} type="button">
            {t(`presets.${preset.key}`)}
          </button>
        ))}
        {presets.map((preset) => (
          <span className="inline-flex items-center rounded-full border border-sky/40 bg-sky/10 text-xs font-semibold text-sky" key={preset.id}>
            <button className="h-8 pl-3 pr-1" onClick={() => { onApply(preset.filters); }} type="button">{preset.name}</button>
            <button aria-label={t("presets.delete", { name: preset.name })} className="mr-1 rounded-full p-1 hover:bg-sky/20" onClick={() => void onDelete(preset.id)} type="button">
              <X size={12} />
            </button>
          </span>
        ))}
        <form className="flex items-center gap-1" onSubmit={(event) => void submit(event)}>
          <input
            aria-label={t("presets.nameLabel")}
            className="input h-8 w-40 text-xs"
            maxLength={SCREENER_PRESET_NAME_MAX_LENGTH}
            onChange={(event) => { setName(event.target.value); }}
            placeholder={t("presets.namePlaceholder")}
            value={name}
          />
          <button aria-label={t("presets.save")} className="btn-ghost h-8 px-2" disabled={!name.trim()} type="submit">
            <Save size={15} />
          </button>
        </form>
      </div>
      {error && <p className="text-xs text-coral">{error}</p>}
    </div>
  );
}
