import { AlertTriangle, BadgeCheck, Eye, PlusCircle, ShieldCheck, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { GuideEffect } from "./import-guide-steps";

/** Couleur et icône fixes par effet : la même lecture partout dans le guide. */
const EFFECT_STYLES: Record<GuideEffect, { icon: LucideIcon; tone: string }> = {
  preview: { icon: Eye, tone: "border-slate-500/40 bg-slate-500/10 text-slate-300" },
  write: { icon: PlusCircle, tone: "border-mint/40 bg-mint/10 text-mint" },
  verify: { icon: ShieldCheck, tone: "border-sky/40 bg-sky/10 text-sky" },
  certify: { icon: BadgeCheck, tone: "border-violet-400/40 bg-violet-400/10 text-violet-300" },
  flag: { icon: AlertTriangle, tone: "border-amber/40 bg-amber/10 text-amber" }
};

export function EffectBadge({ effect }: { effect: GuideEffect }) {
  const { t } = useTranslation("settings");
  const { icon: Icon, tone } = EFFECT_STYLES[effect];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      <Icon aria-hidden size={12} />
      {t(`importGuide.effects.${effect}.label`)}
    </span>
  );
}
