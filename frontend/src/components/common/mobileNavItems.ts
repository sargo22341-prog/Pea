import type { User } from "@pea/shared";
import { BarChart3, CalendarDays, Home, Newspaper, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type MobileNavItem = {
  icon: LucideIcon;
  labelKey: string;
  path: string;
};

export function getMobileNavItems(user: Pick<User, "assetNewsEnabled">): MobileNavItem[] {
  return [
    { path: "/", labelKey: "navigation:dashboard", icon: Home },
    ...(user.assetNewsEnabled ? [{ path: "/news", labelKey: "navigation:news", icon: Newspaper }] : []),
    { path: "/search", labelKey: "navigation:search", icon: Search },
    { path: "/analysis", labelKey: "navigation:analysis", icon: BarChart3 },
    { path: "/dividends", labelKey: "navigation:dividends", icon: CalendarDays }
  ];
}
