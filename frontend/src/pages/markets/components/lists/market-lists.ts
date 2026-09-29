import type { MarketListId } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight, BadgePercent, Cpu, Flame, Gem, Landmark, PiggyBank, Rocket, ShieldCheck, Sprout, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Listes affichées d'emblée ; les suivantes sont repliées sous « Plus de listes ». */
export const PRIMARY_LIST_COUNT = 3;

export const MARKET_LISTS: readonly { id: MarketListId; icon: LucideIcon }[] = [
  { id: "day_gainers", icon: ArrowUpRight },
  { id: "day_losers", icon: ArrowDownRight },
  { id: "trending_fr", icon: TrendingUp },
  { id: "high_dividend_yield", icon: BadgePercent },
  { id: "top_etfs_us", icon: Landmark },
  { id: "undervalued_large_caps", icon: Gem },
  { id: "undervalued_growth_stocks", icon: Flame },
  { id: "growth_technology_stocks", icon: Cpu },
  { id: "aggressive_small_caps", icon: Rocket },
  { id: "small_cap_gainers", icon: Sprout },
  { id: "top_mutual_funds", icon: Wallet },
  { id: "conservative_foreign_funds", icon: ShieldCheck },
  { id: "high_yield_bond", icon: PiggyBank }
];
