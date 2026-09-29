import type { User } from "@pea/shared";
import { BarChart3, CalendarDays, Coins, Globe2, Home, Newspaper, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface MobileNavItem {
  icon: LucideIcon;
  labelKey: string;
  path: string;
}

export function getMobileNavItems(user: Pick<User, "assetNewsEnabled">, options: { marketsEnabled: boolean }): MobileNavItem[] {
  return [
    { path: "/", labelKey: "navigation:dashboard", icon: Home },
    ...(user.assetNewsEnabled ? [{ path: "/news", labelKey: "navigation:news", icon: Newspaper }] : []),
    ...(options.marketsEnabled ? [{ path: "/markets", labelKey: "navigation:markets", icon: Globe2 }] : []),
    { path: "/search", labelKey: "navigation:search", icon: Search },
    { path: "/analysis", labelKey: "navigation:analysis", icon: BarChart3 },
    { path: "/calendar", labelKey: "navigation:calendar", icon: CalendarDays },
    { path: "/dividends", labelKey: "navigation:dividends", icon: Coins }
  ];
}
