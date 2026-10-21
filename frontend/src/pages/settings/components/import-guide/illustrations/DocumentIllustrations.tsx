import { useTranslation } from "react-i18next";
import { AppCard, DocSheet, FlowArrow, IllustrationFrame, TextBar } from "./svg-parts";

const LABEL = "fill-slate-400 text-[8px]";
const HIGHLIGHT = "fill-slate-100 text-[8px] font-semibold";

/** Export CSV : une ligne par position, colonnes quantité et PRU reprises telles quelles. */
export function CsvIllustration() {
  const { t } = useTranslation("settings");
  const rows = [46, 62, 78, 94, 110];
  return (
    <IllustrationFrame>
      <DocSheet height={130} tag="CSV" width={160} x={10} y={10} />
      <text className={LABEL} x={20} y={44}>{t("importGuide.illustrations.asset")}</text>
      <rect className="fill-mint/10 stroke-mint/40" height={86} rx={3} width={76} x={84} y={32} />
      <text className={HIGHLIGHT} x={89} y={44}>{t("importGuide.illustrations.quantity")}</text>
      <text className={HIGHLIGHT} x={130} y={44}>{t("importGuide.illustrations.averagePrice")}</text>
      {rows.slice(1).map((y) => (
        <g key={y}>
          <TextBar width={56} x={20} y={y} />
          <TextBar tone="fill-mint/70" width={24} x={90} y={y} />
          <TextBar tone="fill-mint/70" width={22} x={130} y={y} />
        </g>
      ))}
      <FlowArrow x={180} y={75} />
      <AppCard badge={t("importGuide.illustrations.positionsBadge")} title={t("importGuide.illustrations.positions")} tone="mint" x={214} y={46} />
    </IllustrationFrame>
  );
}

/** Avis d'opéré : les champs lus (date, sens, quantité, cours, frais, ISIN) deviennent une opération. */
export function AvisIllustration() {
  const { t } = useTranslation("settings");
  const fields = ["date", "side", "quantity", "price", "fees", "isin"] as const;
  return (
    <IllustrationFrame>
      <DocSheet height={130} tag="PDF" width={160} x={10} y={10} />
      <TextBar width={70} x={42} y={14} />
      {fields.map((field, index) => {
        const y = 40 + index * 16;
        return (
          <g key={field}>
            <text className={LABEL} x={20} y={y + 5}>{t(`importGuide.illustrations.${field}`)}</text>
            <rect className="fill-mint/15 stroke-mint/40" height={10} rx={2} width={62} x={96} y={y - 3} />
            <TextBar tone="fill-mint/70" width={40} x={100} y={y} />
          </g>
        );
      })}
      <FlowArrow x={180} y={75} />
      <AppCard badge={t("importGuide.illustrations.tradeBadge")} title={t("importGuide.illustrations.trade")} tone="mint" x={214} y={46} />
    </IllustrationFrame>
  );
}

/** Relevé de coupons : brut, retenue et net de chaque ligne, contrôlés par le total. */
export function CouponsIllustration() {
  const { t } = useTranslation("settings");
  const rows = [52, 68, 84];
  return (
    <IllustrationFrame>
      <DocSheet height={130} tag="PDF" width={160} x={10} y={10} />
      <text className={LABEL} x={20} y={40}>{t("importGuide.illustrations.gross")}</text>
      <text className={LABEL} x={72} y={40}>{t("importGuide.illustrations.withholding")}</text>
      <text className={HIGHLIGHT} x={124} y={40}>{t("importGuide.illustrations.net")}</text>
      {rows.map((y) => (
        <g key={y}>
          <TextBar width={32} x={20} y={y} />
          <TextBar width={26} x={72} y={y} />
          <TextBar tone="fill-violet-300/80" width={28} x={124} y={y} />
        </g>
      ))}
      <path className="stroke-line" d="M20 100 h138" strokeWidth={1} />
      <text className={HIGHLIGHT} x={20} y={116}>{t("importGuide.illustrations.total")}</text>
      <rect className="fill-violet-400/15 stroke-violet-400/50" height={12} rx={2} width={36} x={120} y={107} />
      <FlowArrow x={180} y={75} />
      <AppCard badge={t("importGuide.illustrations.certifiedBadge")} title={t("importGuide.illustrations.dividend")} tone="violet" x={214} y={46} />
    </IllustrationFrame>
  );
}

/** Relevé espèces : ancien solde + lignes = nouveau solde ; chaque ligne retrouvée est vérifiée. */
export function CashIllustration() {
  const { t } = useTranslation("settings");
  const lines = [
    { y: 56, found: true },
    { y: 72, found: true },
    { y: 88, found: false }
  ];
  return (
    <IllustrationFrame>
      <DocSheet height={130} tag="PDF" width={160} x={10} y={10} />
      <text className={LABEL} x={20} y={42}>{t("importGuide.illustrations.openingBalance")}</text>
      <TextBar tone="fill-sky/70" width={30} x={124} y={37} />
      {lines.map(({ y, found }) => (
        <g key={y}>
          <circle className={found ? "fill-sky/25 stroke-sky" : "fill-amber/25 stroke-amber"} cx={24} cy={y + 2} r={4} strokeWidth={1} />
          <TextBar width={70} x={34} y={y} />
          <TextBar width={26} x={128} y={y} />
        </g>
      ))}
      <path className="stroke-line" d="M20 104 h138" strokeWidth={1} />
      <text className={HIGHLIGHT} x={20} y={120}>{t("importGuide.illustrations.closingBalance")}</text>
      <TextBar tone="fill-sky/70" width={30} x={124} y={115} />
      <FlowArrow x={180} y={75} />
      <AppCard badge={t("importGuide.illustrations.verifiedBadge")} title={t("importGuide.illustrations.operations")} tone="sky" x={214} y={20} />
      <AppCard badge={t("importGuide.illustrations.missingBadge")} title={t("importGuide.illustrations.unmatched")} tone="amber" x={214} y={84} />
    </IllustrationFrame>
  );
}
