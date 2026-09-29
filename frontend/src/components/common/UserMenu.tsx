import type { User } from "@pea/shared";
import { ChevronDown, Settings, Shield, Target } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { useDismiss } from "../../hooks/useDismiss";
import { MOTION } from "./motion";

interface UserMenuProps {
  user: User;
  profileIconUrl: string;
  shouldLoadProfileIcon: boolean;
  onProfileIconError: () => void;
  compact?: boolean;
}

const itemClass = "flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-panel2 hover:text-mint";

export function UserMenu({ compact = false, onProfileIconError, profileIconUrl, shouldLoadProfileIcon, user }: UserMenuProps) {
  const { t } = useTranslation("navigation");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const initial = user.username.slice(0, 1).toUpperCase();

  const close = useCallback(() => { setOpen(false); }, []);
  useDismiss(open, rootRef, close);

  const avatar = !shouldLoadProfileIcon || !profileIconUrl ? (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-sky">
      {initial}
    </span>
  ) : (
    <img
      alt=""
      className="h-6 w-6 rounded-full object-cover"
      onError={onProfileIconError}
      src={profileIconUrl}
    />
  );

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("userMenu")}
        className={compact ? "btn-ghost px-2" : "btn-ghost"}
        onClick={() => { setOpen((current) => !current); }}
        type="button"
      >
        {avatar}
        {!compact ? <span className="max-w-32 truncate">{user.username}</span> : null}
        <ChevronDown className={open ? "rotate-180 transition" : "transition"} size={15} />
      </button>

      {open ? (
        <div className={`absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-md border border-line bg-panel shadow-glow ${MOTION.menu}`} role="menu">
          <NavLink className={itemClass} onClick={() => { setOpen(false); }} role="menuitem" to="/objectives">
            <Target size={16} />
            {t("objectives")}
          </NavLink>
          <NavLink className={itemClass} onClick={() => { setOpen(false); }} role="menuitem" to="/settings">
            <Settings size={16} />
            {t("settings")}
          </NavLink>
          {user.role === "admin" ? (
            <NavLink className={itemClass} onClick={() => { setOpen(false); }} role="menuitem" to="/admin">
              <Shield size={16} />
              {t("admin")}
            </NavLink>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
