import type { User } from "@pea/shared";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";
import type { NavLinkRenderProps } from "react-router-dom";
import { useAuthenticatedImageUrl } from "../../hooks/useAuthenticatedImageUrl";
import { getMobileNavItems } from "./mobileNavItems";

function navButtonClass({ isActive }: NavLinkRenderProps) {
  return isActive ? "btn bg-panel2 text-mint" : "btn-ghost";
}

function mobileNavClass({ isActive }: NavLinkRenderProps) {
  return `min-w-0 flex flex-col items-center gap-1 px-0.5 py-3 text-[10px] ${isActive ? "text-mint" : "text-slate-400"}`;
}

export function Shell({ user }: { user: User }) {
  const { t } = useTranslation(["common", "navigation"]);
  const [profileCacheBust, setProfileCacheBust] = useState(() => Date.now());
  const [hasProfileIcon, setHasProfileIcon] = useState(() => Boolean(user.hasProfileIcon));
  const [profileFailed, setProfileFailed] = useState(() => !user.hasProfileIcon);
  const shouldLoadProfileIcon = hasProfileIcon && !profileFailed;
  const profileIconUrl = useAuthenticatedImageUrl(`/api/auth/me/profile-icon?v=${profileCacheBust}`, profileCacheBust, shouldLoadProfileIcon);
  const links = useMemo(() => getMobileNavItems({ assetNewsEnabled: user.assetNewsEnabled }), [user.assetNewsEnabled]);

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
      <header className="sticky top-0 z-20 border-b border-line bg-ink/85 backdrop-blur" data-system-bars-top="#071014">
        <div className="safe-header-top mx-auto flex max-w-6xl min-w-0 items-center justify-between gap-3 px-4 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <img alt="" className="h-11 w-11 rounded-md object-cover shadow-glow" src="/pea-icon.png" />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{t("common:app.name")}</p>
              <p className="text-xs text-slate-400">{t("common:app.subtitle")}</p>
            </div>
          </div>
          <NavLink className="btn-ghost shrink-0 px-2 lg:hidden" title={t("navigation:settings")} to="/settings">
            {!shouldLoadProfileIcon || !profileIconUrl ? (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-sky">
                {user.username.slice(0, 1).toUpperCase()}
              </span>
            ) : (
              <img
                alt=""
                className="h-6 w-6 rounded-full object-cover"
                onError={() => setProfileFailed(true)}
                src={profileIconUrl}
              />
            )}
          </NavLink>
          <nav className="hidden items-center gap-2 lg:flex">
            {links.map((link) => (
              <NavLink
                className={navButtonClass}
                key={link.path}
                to={link.path}
              >
                <link.icon size={17} />
                {t(link.labelKey)}
              </NavLink>
            ))}
            <NavLink className={navButtonClass} title={t("navigation:settings")} to="/settings">
              {!shouldLoadProfileIcon || !profileIconUrl ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-sky">
                  {user.username.slice(0, 1).toUpperCase()}
                </span>
              ) : (
                <img
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                  onError={() => setProfileFailed(true)}
                  src={profileIconUrl}
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

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-ink/95 lg:hidden" data-system-bars-bottom="#071014" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
        {links.map((link) => (
          <NavLink
            className={mobileNavClass}
            key={link.path}
            to={link.path}
          >
            <link.icon size={20} />
            <span className="w-full truncate text-center">{t(link.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
