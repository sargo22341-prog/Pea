import { BookOpen, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EffectBadge } from "./EffectBadge";
import { IMPORT_GUIDE_STEPS, stepEffects } from "./import-guide-steps";
import { ImportGuideDialog } from "./ImportGuideDialog";
import { useGuideProgress } from "./useGuideProgress";

const IMPORT_STEPS = IMPORT_GUIDE_STEPS.filter((step) => step.isImport);

/** Avancement de lecture du guide, affiché en pastille : nouveau, en cours ou lu. */
function ProgressChip({ seen, complete }: { seen: number; complete: boolean }) {
  const { t } = useTranslation("settings");
  if (complete) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-mint/40 bg-mint/10 px-2 py-0.5 text-xs text-mint">
        <CheckCircle2 aria-hidden size={12} />
        {t("importGuide.progress.complete")}
      </span>
    );
  }
  if (seen === 0) return <span className="rounded-full border border-sky/40 bg-sky/10 px-2 py-0.5 text-xs text-sky">{t("importGuide.progress.new")}</span>;
  return <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-xs text-slate-300">{t("importGuide.progress.partial", { seen, total: IMPORT_GUIDE_STEPS.length })}</span>;
}

/**
 * Encart affiché en tête des imports Boursorama : ordre conseillé des quatre imports avec leurs
 * effets, et ouverture du guide pas à pas.
 */
export function ImportGuideSection() {
  const { t } = useTranslation("settings");
  const progress = useGuideProgress();
  const [open, setOpen] = useState(false);

  return (
    <section className="card overflow-hidden border-sky/30">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{t("importGuide.sectionTitle")}</h2>
            <ProgressChip complete={progress.complete} seen={progress.seen.size} />
          </div>
          <p className="muted">{t("importGuide.sectionHelp")}</p>
        </div>
        <button className="btn-primary shrink-0" onClick={() => { setOpen(true); }} type="button">
          <BookOpen size={17} />
          {t("importGuide.open")}
        </button>
      </div>
      <ol className="grid gap-2 p-4 sm:grid-cols-2">
        {IMPORT_STEPS.map((step, index) => (
          <li className="flex items-start gap-3 rounded-md border border-line bg-ink/40 p-3" key={step.id}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sky/50 bg-sky/10 text-xs font-semibold text-sky">{index + 1}</span>
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-slate-100">{t(`importGuide.steps.${step.id}.title`)}</p>
              <div className="flex flex-wrap gap-1">
                {stepEffects(step).map((effect) => <EffectBadge effect={effect} key={effect} />)}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {open ? <ImportGuideDialog onClose={() => { setOpen(false); }} progress={progress} /> : null}
    </section>
  );
}
