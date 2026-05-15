import type { User } from "@pea/shared";
import { BarChart3, CalendarDays, Home, Newspaper, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type MobileNavItem = {
  icon: LucideIcon;
  label: string;
  path: string;
};

export function getMobileNavItems(user: Pick<User, "assetNewsEnabled">): MobileNavItem[] {
  return [
    { path: "/", label: "Dashboard", icon: Home },
    ...(user.assetNewsEnabled ? [{ path: "/news", label: "Actualite", icon: Newspaper }] : []),
    { path: "/search", label: "Chercher", icon: Search },
    { path: "/analysis", label: "Analyse", icon: BarChart3 },
    { path: "/dividends", label: "Dividendes", icon: CalendarDays }
  ];
}
