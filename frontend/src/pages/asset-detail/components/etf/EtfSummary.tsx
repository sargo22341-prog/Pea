import type { AssetFundDetails } from "@pea/shared";
import { Building2, Coins, Percent, Repeat2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { InfoHint } from "../../../../components/common/disclosure/InfoHint";
import { AssetInfoTile } from "../../../../components/common/metrics/AssetInfoTile";
import { formatCompactMoney, formatFractionPercent, MISSING_VALUE } from "../../../../lib/format-metrics";

/** Yahoo publie l'encours d'un fonds en millions de la devise de cotation. */
const NET_ASSETS_UNIT = 1_000_000;

/** Identité du fonds (émetteur, encours, frais, rotation) affichée dans l'aperçu. */
export function EtfSummary({ data, currency }: { data: AssetFundDetails; currency: string }) {
  const { t } = useTranslation("asset");

  return (
    <section className="w-full">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">{t("etf.title")}</h2>
      <div className="grid grid-cols-2 overflow-hidden rounded-[16px] border border-white/[0.05] bg-slate-950/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] lg:grid-cols-4">
        <AssetInfoTile icon={<Building2 size={18} />} iconTone="slate" label={t("etf.issuer")} value={data.family ?? MISSING_VALUE} variant="market" />
        <AssetInfoTile
          icon={<Coins size={18} />}
          iconTone="green"
          label={t("etf.netAssets")}
          value={data.totalNetAssets ? formatCompactMoney(data.totalNetAssets * NET_ASSETS_UNIT, currency) : MISSING_VALUE}
          variant="market"
        />
        <AssetInfoTile
          hint={<InfoHint label={t("etf.fees")}>{t("etf.feesHint")}</InfoHint>}
          icon={<Percent size={18} />}
          iconTone="cyan"
          label={t("etf.fees")}
          value={formatFractionPercent(data.annualReportExpenseRatio, { digits: 2 })}
          variant="market"
        />
        <AssetInfoTile
          hint={<InfoHint label={t("etf.turnover")}>{t("etf.turnoverHint")}</InfoHint>}
          icon={<Repeat2 size={18} />}
          iconTone="amber"
          label={t("etf.turnover")}
          value={formatFractionPercent(data.annualHoldingsTurnover, { digits: 2 })}
          variant="market"
        />
      </div>
    </section>
  );
}
