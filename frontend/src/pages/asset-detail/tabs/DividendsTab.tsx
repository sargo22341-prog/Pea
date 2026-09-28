import type { AssetDetails } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { DividendLineChartSection } from "../../../components/charts/financial/DividendLineChartSection";
import { DividendSustainabilityBlock } from "../components/dividends/DividendSustainabilityBlock";

/** Onglet « Dividendes » : croissance et soutenabilité, puis l'historique des versements. */
export function DividendsTab({ asset, currentPrice }: { asset: AssetDetails; currentPrice: number }) {
  const { t } = useTranslation("asset");
  return (
    <div className="space-y-4">
      <DividendSustainabilityBlock asset={asset} />
      <section className="card overflow-hidden">
        <h2 className="mb-4 font-semibold">{t("dividend")}</h2>
        <DividendLineChartSection
          averageBuyPrice={asset.position?.averageBuyPrice}
          currentPrice={currentPrice}
          dividends={asset.dividends}
          marketInfo={asset.marketInfo}
        />
      </section>
    </div>
  );
}
