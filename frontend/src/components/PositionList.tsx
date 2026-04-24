import type { PositionWithMarket } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { money, percent } from "../lib/format";
import { StaleBadge } from "./StaleBadge";

export function PositionList({ positions }: { positions: PositionWithMarket[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line p-4">
        <h2 className="font-semibold">Positions</h2>
      </div>
      <div className="divide-y divide-line">
        {positions.map((position) => {
          const positive = position.performance >= 0;
          const Icon = positive ? ArrowUpRight : ArrowDownRight;
          return (
            <Link
              className="grid grid-cols-[1fr_auto] gap-3 p-4 transition hover:bg-panel2 sm:grid-cols-[1.6fr_.6fr_.8fr_.8fr_.8fr]"
              key={position.id}
              to={`/assets/${position.symbol}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink font-bold text-sky">
                  {position.symbol.slice(0, 3)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{position.name}</p>
                    <StaleBadge show={position.quote?.stale} />
                  </div>
                  <p className="muted">{position.symbol}</p>
                </div>
              </div>
              <div className="hidden self-center text-right sm:block">
                <p className="text-sm">{position.quantity}</p>
                <p className="muted">qté</p>
              </div>
              <div className="hidden self-center text-right sm:block">
                <p className="text-sm">{money(position.currentPrice, position.currency)}</p>
                <p className="muted">prix</p>
              </div>
              <div className="self-center text-right">
                <p className="font-semibold">{money(position.marketValue, position.currency)}</p>
                <p className="muted">{position.estimatedAnnualDividend ? money(position.estimatedAnnualDividend, position.currency) : "Div. n/a"}</p>
              </div>
              <div className={`hidden items-center justify-end gap-1 self-center text-sm font-semibold sm:flex ${positive ? "text-mint" : "text-coral"}`}>
                <Icon size={16} />
                {percent(position.performancePercent)}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
