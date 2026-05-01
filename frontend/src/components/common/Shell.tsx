/**
 * Role du fichier : fournir le layout applicatif commun avec navigation
 * desktop/mobile et acces aux parametres de profil.
 */

import type { User } from "@pea/shared";
import { BarChart3, CalendarDays, Home, Newspaper, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { NavLinkRenderProps } from "react-router-dom";

function navButtonClass({ isActive }: NavLinkRenderProps) {
  return isActive ? "btn bg-panel2 text-mint" : "btn-ghost";
}

function mobileNavClass({ isActive }: NavLinkRenderProps) {
  return `min-w-0 flex flex-col items-center gap-1 px-0.5 py-3 text-[10px] ${isActive ? "text-mint" : "text-slate-400"}`;
}

export function Shell({ user }: { user: User }) {
  const [profileCacheBust, setProfileCacheBust] = useState(() => Date.now());
  const [hasProfileIcon, setHasProfileIcon] = useState(() => Boolean(user.hasProfileIcon));
  const [profileFailed, setProfileFailed] = useState(() => !user.hasProfileIcon);
  const links = [
    { to: "/", label: "Dashboard", icon: Home },
    ...(user.assetNewsEnabled ? [{ to: "/news", label: "Actualite", icon: Newspaper }] : []),
    { to: "/search", label: "Chercher", icon: Search },
    { to: "/analysis", label: "Analyse", icon: BarChart3 },
    { to: "/dividends", label: "Dividendes", icon: CalendarDays }
  ];

  useEffect(() => {
    const onProfileIconUpdated = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      const nextHasProfileIcon = typeof detail === "object" && detail !== null && "hasProfileIcon" in detail ? Boolean(detail.hasProfileIcon) : true;
      setHasProfileIcon(nextHasProfileIcon);
      setProfileFailed(!nextHasProfileIcon);
      setProfileCacheBust(typeof detail === "object" && detail !== null && typeof detail.cacheBust === "number" ? detail.cacheBust : Date.now());
    };
    window.addEventListener("profile-icon-updated", onProfileIconUpdated);
    return () => window.removeEventListener("profile-icon-updated", onProfileIconUpdated);
  }, []);

  useEffect(() => {
    setHasProfileIcon(Boolean(user.hasProfileIcon));
    setProfileFailed(!user.hasProfileIcon);
  }, [user.hasProfileIcon]);

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
            {!hasProfileIcon || profileFailed ? (
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
                className={navButtonClass}
                key={link.to}
                to={link.to}
              >
                <link.icon size={17} />
                {link.label}
              </NavLink>
            ))}
            <NavLink className={navButtonClass} title="Parametres" to="/settings">
              {!hasProfileIcon || profileFailed ? (
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
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl min-w-0 px-2 py-4 sm:px-4 sm:py-6">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-ink/95 lg:hidden" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
        {links.map((link) => (
          <NavLink
            className={mobileNavClass}
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
