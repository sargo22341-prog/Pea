import type { User } from "@pea/shared";
import { Briefcase, CalendarDays, Home, LogOut, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

const links = [
  { to: "/", label: "Dashboard", icon: Home },
  { to: "/portfolio", label: "Portefeuille", icon: Briefcase },
  { to: "/search", label: "Chercher", icon: Search },
  { to: "/dividends", label: "Dividendes", icon: CalendarDays },
];

export function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();
  const [profileCacheBust, setProfileCacheBust] = useState(() => Date.now());
  const [profileFailed, setProfileFailed] = useState(false);

  useEffect(() => {
    const onProfileIconUpdated = (event: Event) => {
      setProfileFailed(false);
      setProfileCacheBust(event instanceof CustomEvent && typeof event.detail === "number" ? event.detail : Date.now());
    };
    window.addEventListener("profile-icon-updated", onProfileIconUpdated);
    return () => window.removeEventListener("profile-icon-updated", onProfileIconUpdated);
  }, []);

  async function logout() {
    await api.logout();
    onLogout();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden pb-20 lg:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-ink/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl min-w-0 items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <img alt="" className="h-11 w-11 rounded-md object-cover shadow-glow" src="/pea-icon.png" />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">PEA Portfolio</p>
              <p className="text-xs text-slate-400">Actions et ETF</p>
            </div>
          </div>
          <NavLink className="btn-ghost shrink-0 px-2 lg:hidden" title="Parametres" to="/settings">
            {profileFailed ? (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-sky">
                {user.username.slice(0, 1).toUpperCase()}
              </span>
            ) : (
              <img
                alt=""
                className="h-6 w-6 rounded-full object-cover"
                onError={() => setProfileFailed(true)}
                src={`/api/auth/me/profile-icon?v=${profileCacheBust}`}
              />
            )}
          </NavLink>
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
            <NavLink className={({ isActive }) => (isActive ? "btn bg-panel2 text-mint" : "btn-ghost")} title="Parametres" to="/settings">
              {profileFailed ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-sky">
                  {user.username.slice(0, 1).toUpperCase()}
                </span>
              ) : (
                <img
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                  onError={() => setProfileFailed(true)}
                  src={`/api/auth/me/profile-icon?v=${profileCacheBust}`}
                />
              )}
              {user.username}
            </NavLink>
            <button className="btn-ghost" onClick={logout} title="Deconnexion" type="button">
              <LogOut size={17} />
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl min-w-0 px-4 py-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-ink/95 lg:hidden">
        {links.map((link) => (
          <NavLink
            className={({ isActive }) =>
              `min-w-0 flex flex-col items-center gap-1 px-0.5 py-3 text-[10px] ${isActive ? "text-mint" : "text-slate-400"}`
            }
            key={link.to}
            to={link.to}
          >
            <link.icon size={20} />
            <span className="w-full truncate text-center">{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
