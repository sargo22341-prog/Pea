import type { User } from "@pea/shared";
import { BarChart3, Coins, Globe2, Home, Newspaper, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface MobileNavItem {
  icon: LucideIcon;
  labelKey: string;
  path: string;
}

/**
 * Menu volontairement court (décision utilisateur, voir `plan.md` « Navigation ») : la Recherche
 * est ouverte depuis Marchés (« Rechercher un actif ») et le Calendrier depuis le dashboard. La
 * Recherche ne revient dans le menu que si la page Marchés est coupée, pour rester accessible.
 */
export function getMobileNavItems(user: Pick<User, "assetNewsEnabled">, options: { marketsEnabled: boolean }): MobileNavItem[] {
  return [
    { path: "/", labelKey: "navigation:dashboard", icon: Home },
    ...(user.assetNewsEnabled ? [{ path: "/news", labelKey: "navigation:news", icon: Newspaper }] : []),
    options.marketsEnabled
      ? { path: "/markets", labelKey: "navigation:markets", icon: Globe2 }
      : { path: "/search", labelKey: "navigation:search", icon: Search },
    { path: "/analysis", labelKey: "navigation:analysis", icon: BarChart3 },
    { path: "/dividends", labelKey: "navigation:dividends", icon: Coins }
  ];
}
