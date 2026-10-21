import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { guideStepStatus, IMPORT_GUIDE_STEPS, type GuideStepStatus } from "./import-guide-steps";

const STATUS_TONE: Record<GuideStepStatus, string> = {
  current: "border-sky bg-sky/15 text-sky",
  seen: "border-mint/50 bg-mint/10 text-mint",
  upcoming: "border-line bg-panel text-slate-500"
};

/**
 * Barre d'étapes du guide : étape en cours (bleu), déjà consultée (vert, coche) ou à venir
 * (grise). Chaque pastille est un bouton pour sauter directement à l'étape.
 */
export function GuideStepper({ current, seen, onSelect }: { current: number; seen: ReadonlySet<number>; onSelect: (index: number) => void }) {
  const { t } = useTranslation("settings");
  return (
    <ol className="flex items-start gap-1 overflow-x-auto pb-1">
      {IMPORT_GUIDE_STEPS.map((step, index) => {
        const status = guideStepStatus(index, current, seen);
        const title = t(`importGuide.steps.${step.id}.short`);
        return (
          <li className="flex min-w-[3.5rem] flex-1 flex-col items-center gap-1" key={step.id}>
            <button
              aria-current={status === "current" ? "step" : undefined}
              aria-label={t("importGuide.stepLabel", { index: index + 1, title, status: t(`importGuide.status.${status}`) })}
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold transition ${STATUS_TONE[status]}`}
              onClick={() => { onSelect(index); }}
              type="button"
            >
              {status === "seen" ? <Check aria-hidden size={14} /> : index + 1}
            </button>
            <span className={`text-center text-[11px] leading-tight ${status === "current" ? "text-slate-100" : "text-slate-500"}`}>{title}</span>
          </li>
        );
      })}
    </ol>
  );
}
