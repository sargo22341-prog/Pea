import { Target, TrendingUp, UsersRound } from "lucide-react";
import { money } from "../../../lib/format";
import type { AssetAnalystConsensus as AssetAnalystConsensusData } from "@pea/shared";

const RECOMMENDATION_LABELS: Record<string, string> = {
  "strong_buy": "ACHETER FORT",
  "buy": "ACHETER",
  "hold": "CONSERVER",
  "underperform": "ALLÉGER",
  "sell": "VENDRE"
};

export function AssetAnalystConsensus({
  data,
  currency
}: {
  data: AssetAnalystConsensusData;
  currency: string;
}) {
  const {
    currentPrice,
    targetMeanPrice,
    targetMedianPrice,
    recommendationMean,
    recommendationKey,
    numberOfAnalystOpinions
  } = data;

  const targetPrice = targetMedianPrice ?? targetMeanPrice;
  if (!targetPrice || !currentPrice || !recommendationMean || !numberOfAnalystOpinions) return null;

  const upside = targetPrice - currentPrice;
  const potential = (upside / currentPrice) * 100;
  const score = recommendationMean;
  const scorePosition = ((score - 1) / 4) * 100;
  const recommendationLabel = recommendationKey ? (RECOMMENDATION_LABELS[recommendationKey] ?? recommendationKey.toUpperCase()) : "—";

  const scoreColor =
    score <= 1.5 ? "bg-emerald-600" :
    score <= 2.5 ? "bg-lime-500" :
    score <= 3.5 ? "bg-yellow-400 text-black" :
    score <= 4.5 ? "bg-orange-500" :
    "bg-red-500";

  const labelColor =
    score <= 1.5 ? "text-mint" :
    score <= 2.5 ? "text-lime-400" :
    score <= 3.5 ? "text-yellow-300" :
    score <= 4.5 ? "text-orange-400" :
    "text-red-400";

  return (
    <section className="w-full">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
        Consensus des analystes et objectif de cours
      </h2>

      <div className="rounded-[14px] border border-white/[0.05] bg-slate-950/20 p-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <AnalystMetric
            icon={<Target size={22} />}
            label="Objectif médian"
            value={money(targetPrice, currency)}
            subValue={`vs. cours actuel ${money(currentPrice, currency)}`}
          />

          <AnalystMetric
            icon={<TrendingUp size={22} />}
            label="Potentiel"
            value={`${upside >= 0 ? "+" : ""}${potential.toFixed(2).replace(".", ",")} %`}
            subValue={`(${upside >= 0 ? "+" : ""}${money(upside, currency)} de hausse)`}
          />

          <AnalystMetric
            icon={<UsersRound size={22} />}
            label="Nombre d'analystes"
            value={numberOfAnalystOpinions}
            subValue={`${data.targetLowPrice ? money(data.targetLowPrice, currency) : "—"} – ${data.targetHighPrice ? money(data.targetHighPrice, currency) : "—"}`}
            valueClassName="text-white"
          />

          <div className="col-span-2 min-w-0 lg:col-span-2 lg:pl-3">
            <p className="text-[10px] uppercase text-slate-400">
              Recommandation consensuelle
            </p>

            <p className={`text-base font-semibold ${labelColor}`}>{recommendationLabel}</p>

            <div className="relative mt-4">
              <div className="h-2 rounded-full bg-gradient-to-r from-mint via-lime-400 via-yellow-300 via-orange-400 to-red-500" />

              <div
                className={`absolute -top-6 -translate-x-1/2 rounded-md px-2 py-[2px] text-[11px] font-semibold text-white ${scoreColor}`}
                style={{ left: `${scorePosition}%` }}
              >
                {score.toFixed(2).replace(".", ",")}
              </div>

              <div
                className="absolute -top-1 h-0 w-0 -translate-x-1/2 border-x-3 border-t-6 border-x-transparent border-t-white"
                style={{ left: `${scorePosition}%` }}
              />
            </div>

            <div className="mt-2 grid grid-cols-5 text-center text-[9px]">
              <div className="text-mint"><p>1</p><p>Acheter fort</p></div>
              <div className="text-lime-400"><p>2</p><p>Acheter</p></div>
              <div className="text-yellow-300"><p>3</p><p>Conserver</p></div>
              <div className="text-orange-400"><p>4</p><p>Alléger</p></div>
              <div className="text-red-400"><p>5</p><p>Vendre</p></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AnalystMetric({
  icon,
  label,
  value,
  subValue,
  valueClassName = "text-mint"
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subValue: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-3 lg:border-r lg:border-white/[0.06] lg:pr-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-mint/25 bg-mint/10 text-mint">
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-[10px] uppercase text-slate-400">{label}</p>
        <p className={`text-base font-semibold ${valueClassName}`}>
          {value}
        </p>
        <p className="text-[11px] text-slate-400">{subValue}</p>
      </div>
    </div>
  );
}
