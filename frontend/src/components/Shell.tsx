import { BarChart3, Briefcase, CalendarDays, Home, Search, Settings } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/portfolio", label: "Portefeuille", icon: Briefcase },
  { to: "/search", label: "Chercher", icon: Search },
  { to: "/dividends", label: "Dividendes", icon: CalendarDays },
  { to: "/settings", label: "Parametres", icon: Settings }
];

export function Shell() {
  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-mint p-2 text-ink">
              <BarChart3 size={22} />
            </div>
            <div>
              <p className="text-lg font-bold">PEA Portfolio</p>
              <p className="text-xs text-slate-400">Actions et ETF</p>
            </div>
          </div>
          <nav className="hidden items-center gap-2 lg:flex">
            {links.map((link) => (
              <NavLink
                className={({ isActive }) => (isActive ? "btn bg-panel2 text-mint" : "btn-ghost")}
                key={link.to}
                to={link.to}
              >
                <link.icon size={17} />
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-ink/95 lg:hidden">
        {links.map((link) => (
          <NavLink
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-1 py-3 text-[11px] ${isActive ? "text-mint" : "text-slate-400"}`
            }
            key={link.to}
            to={link.to}
          >
            <link.icon size={20} />
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
