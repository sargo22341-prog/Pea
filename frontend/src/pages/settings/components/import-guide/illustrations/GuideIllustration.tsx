import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import type { GuideStepId } from "../import-guide-steps";
import { AvisIllustration, CashIllustration, CouponsIllustration, CsvIllustration } from "./DocumentIllustrations";
import { DocSheet, IllustrationFrame } from "./svg-parts";

/** Vue d'ensemble : les quatre documents, dans l'ordre conseillé, alimentent le même PEA. */
function OverviewIllustration() {
  const { t } = useTranslation("settings");
  const docs = [
    { tag: "CSV", label: "csv" },
    { tag: "PDF", label: "avis" },
    { tag: "PDF", label: "coupons" },
    { tag: "PDF", label: "cash" }
  ] as const;
  return (
    <IllustrationFrame>
      {docs.map((doc, index) => {
        const x = 10 + index * 78;
        return (
          <g key={doc.label}>
            <DocSheet height={62} tag={doc.tag} width={58} x={x} y={8} />
            <circle className="fill-sky/20 stroke-sky" cx={x + 44} cy={48} r={9} strokeWidth={1} />
            <text className="fill-sky text-[9px] font-semibold" textAnchor="middle" x={x + 44} y={51}>{index + 1}</text>
            <text className="fill-slate-300 text-[8px]" textAnchor="middle" x={x + 29} y={84}>{t(`importGuide.steps.${doc.label}.short`)}</text>
            <path className="stroke-slate-500" d={`M${x + 29} 90 L160 112`} fill="none" strokeDasharray="3 3" strokeWidth={1.2} />
          </g>
        );
      })}
      <rect className="fill-mint/10 stroke-mint/50" height={30} rx={8} strokeWidth={1.5} width={120} x={100} y={112} />
      <text className="fill-mint text-[10px] font-semibold" textAnchor="middle" x={160} y={131}>{t("importGuide.illustrations.myPea")}</text>
    </IllustrationFrame>
  );
}

const MONTH_STATUSES = ["ok", "ok", "ok", "quiet", "ok", "mismatch", "ok", "missing", "ok", "ok", "ok", "ok"] as const;
const MONTH_TONE: Record<(typeof MONTH_STATUSES)[number], string> = {
  ok: "fill-mint/20 stroke-mint/60",
  quiet: "fill-slate-500/20 stroke-slate-500/60",
  mismatch: "fill-coral/20 stroke-coral/60",
  missing: "fill-amber/20 stroke-amber/60"
};

/** Contrôle mensuel : une case par mois, colorée selon la comparaison du solde. */
function ControlIllustration() {
  const { t } = useTranslation("settings");
  const legend = ["ok", "quiet", "mismatch", "missing"] as const;
  return (
    <IllustrationFrame>
      {MONTH_STATUSES.map((status, index) => {
        const x = 16 + (index % 6) * 48;
        const y = 12 + Math.floor(index / 6) * 44;
        return (
          <g key={index}>
            <rect className={MONTH_TONE[status]} height={34} rx={6} strokeWidth={1.2} width={40} x={x} y={y} />
            <text className="fill-slate-300 text-[9px]" textAnchor="middle" x={x + 20} y={y + 21}>{String(index + 1).padStart(2, "0")}</text>
          </g>
        );
      })}
      {legend.map((status, index) => (
        <g key={status}>
          <rect className={MONTH_TONE[status]} height={10} rx={2} strokeWidth={1} width={10} x={16 + index * 76} y={118} />
          <text className="fill-slate-400 text-[8px]" x={30 + index * 76} y={126}>{t(`importGuide.illustrations.month.${status}`)}</text>
        </g>
      ))}
    </IllustrationFrame>
  );
}

const ILLUSTRATIONS: Record<GuideStepId, () => JSX.Element> = {
  overview: OverviewIllustration,
  csv: CsvIllustration,
  avis: AvisIllustration,
  coupons: CouponsIllustration,
  cash: CashIllustration,
  control: ControlIllustration
};

export function GuideIllustration({ stepId }: { stepId: GuideStepId }) {
  const Illustration = ILLUSTRATIONS[stepId];
  return (
    <div className="rounded-lg border border-line bg-ink/60 p-3">
      <Illustration />
    </div>
  );
}
