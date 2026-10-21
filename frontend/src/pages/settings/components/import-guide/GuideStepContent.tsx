import { ChevronRight, Lightbulb } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EffectBadge } from "./EffectBadge";
import { GuideIllustration } from "./illustrations/GuideIllustration";
import { GUIDE_EFFECTS, type GuideStep } from "./import-guide-steps";

/** Les quatre phases communes à chaque import : rien n'est écrit avant la dernière. */
const IMPORT_PHASES = ["choose", "preview", "decide", "confirm"] as const;

function PhaseFlow() {
  const { t } = useTranslation("settings");
  return (
    <ol className="grid gap-2 sm:grid-cols-4">
      {IMPORT_PHASES.map((phase, index) => (
        <li className={`relative rounded-md border p-2 ${phase === "confirm" ? "border-mint/50 bg-mint/10" : "border-line bg-panel"}`} key={phase}>
          <p className="text-xs font-semibold text-slate-100">{index + 1}. {t(`importGuide.phases.${phase}.title`)}</p>
          <p className="muted text-xs">{t(`importGuide.phases.${phase}.text`)}</p>
          {index < IMPORT_PHASES.length - 1 ? <ChevronRight aria-hidden className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-slate-500 sm:block" size={16} /> : null}
        </li>
      ))}
    </ol>
  );
}

function EffectLegend() {
  const { t } = useTranslation("settings");
  return (
    <ul className="space-y-1.5">
      {GUIDE_EFFECTS.map((effect) => (
        <li className="flex items-start gap-2" key={effect}>
          <span className="w-20 shrink-0"><EffectBadge effect={effect} /></span>
          <span className="text-xs text-slate-300">{t(`importGuide.effects.${effect}.text`)}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">{children}</h4>;
}

export function GuideStepContent({ step }: { step: GuideStep }) {
  const { t } = useTranslation("settings");
  const base = `importGuide.steps.${step.id}`;
  return (
    <div className="space-y-4 text-sm leading-6 text-slate-300">
      <GuideIllustration stepId={step.id} />
      <p>{t(`${base}.intro`)}</p>
      {step.isImport ? (
        <dl className="grid gap-2 rounded-md border border-line bg-panel p-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">{t("importGuide.document")}</dt>
            <dd className="text-slate-200">{t(`${base}.document`)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t("importGuide.prerequisite")}</dt>
            <dd className="text-slate-200">{t(`${base}.prerequisite`)}</dd>
          </div>
        </dl>
      ) : null}
      {step.id === "overview" ? (
        <>
          <section className="space-y-2">
            <SectionTitle>{t("importGuide.phasesTitle")}</SectionTitle>
            <PhaseFlow />
          </section>
          <section className="space-y-2">
            <SectionTitle>{t("importGuide.legendTitle")}</SectionTitle>
            <EffectLegend />
          </section>
        </>
      ) : (
        <section className="space-y-2">
          <SectionTitle>{t(step.isImport ? "importGuide.whatItDoes" : "importGuide.whatYouGet")}</SectionTitle>
          <ul className="space-y-2">
            {step.points.map((point) => (
              <li className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2" key={point.key}>
                <span className="sm:w-20 sm:shrink-0"><EffectBadge effect={point.effect} /></span>
                <span>{t(`${base}.points.${point.key}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="flex gap-2 rounded-md border border-sky/30 bg-sky/5 p-2 text-xs text-slate-300">
        <Lightbulb aria-hidden className="mt-0.5 shrink-0 text-sky" size={14} />
        <span>{t(`${base}.tip`)}</span>
      </p>
    </div>
  );
}
