import { Building2, Coins, Percent, Repeat2 } from "lucide-react";
import type { AllocationChartItem, AssetFundDetails } from "@pea/shared";
import { AssetInfoTile } from "./AssetInfoTile";
import { SectorAllocationChart } from "../../../components/charts/SectorAllocationChart";

const SECTOR_LABELS: Record<string, string> = {
  realestate: "Immobilier",
  consumer_cyclical: "Consommation cyclique",
  basic_materials: "Matériaux de base",
  consumer_defensive: "Consommation défensive",
  technology: "Technologie",
  communication_services: "Communication",
  financial_services: "Services financiers",
  utilities: "Services publics",
  industrials: "Industrie",
  energy: "Énergie",
  healthcare: "Santé"
};

function formatNetAssets(totalNetAssets?: number): string {
  if (!totalNetAssets) return "—";
  if (totalNetAssets >= 1_000_000) return `${(totalNetAssets / 1_000_000).toFixed(1).replace(".", ",")} Bn€`;
  if (totalNetAssets >= 1_000) return `${(totalNetAssets / 1_000).toFixed(1).replace(".", ",")} Md€`;
  return `${totalNetAssets.toFixed(0)} M€`;
}

function formatPercent(value?: number): string {
  if (value === undefined || value === null) return "—";
  return `${(value * 100).toFixed(2).replace(".", ",")} %`;
}

export function AssetEtfFundDetails({ data }: { data: AssetFundDetails }) {
  const sectorData: AllocationChartItem[] = (data.sectorWeightings ?? [])
    .map(({ key, value }) => ({
      name: SECTOR_LABELS[key] ?? key,
      value,
      percentage: value * 100,
      symbols: []
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <section className="w-full">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
        Informations fonds / ETF
      </h2>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="grid grid-cols-2 overflow-hidden rounded-[16px] border border-white/[0.05] bg-slate-950/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
          <AssetInfoTile
            icon={<Building2 size={18} />}
            iconTone="slate"
            label="Émetteur"
            value={data.family ?? "—"}
            variant="market"
          />

          <AssetInfoTile
            icon={<Coins size={18} />}
            iconTone="green"
            label="Actifs nets"
            value={formatNetAssets(data.totalNetAssets)}
            variant="market"
          />

          <AssetInfoTile
            icon={<Percent size={18} />}
            iconTone="cyan"
            label="Frais annuels"
            value={formatPercent(data.annualReportExpenseRatio)}
            variant="market"
          />

          <AssetInfoTile
            icon={<Repeat2 size={18} />}
            iconTone="amber"
            label="Rotation portefeuille"
            value={formatPercent(data.annualHoldingsTurnover)}
            variant="market"
          />
        </div>

        {sectorData.length > 0 && (
          <div className="rounded-[16px] border border-white/[0.05] bg-slate-950/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Répartition sectorielle
            </h3>

            <SectorAllocationChart data={sectorData} />
          </div>
        )}
      </div>
    </section>
  );
}
