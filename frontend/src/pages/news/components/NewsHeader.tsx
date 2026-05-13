import type { User } from "@pea/shared";

export function NewsHeader({
  portfolioOnly,
  toggleMode,
  user
}: {
  portfolioOnly: boolean;
  toggleMode: () => void;
  user: User;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <h1 className="text-2xl font-bold">Actualite</h1>
        <p className="muted">
          Articles Yahoo Finance en {user.newsLanguages.includes("fr") ? "francais" : ""}
          {user.newsLanguages.length === 2 ? " et " : ""}
          {user.newsLanguages.includes("en") ? "anglais" : ""}.
        </p>
      </div>
      <label className="flex items-center gap-3 rounded-md border border-line bg-ink p-3">
        <span className="text-sm font-medium">Mes actifs</span>
        <button
          aria-checked={portfolioOnly}
          className={`flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${portfolioOnly ? "bg-mint" : "bg-panel2"}`}
          onClick={toggleMode}
          role="switch"
          type="button"
        >
          <span className={`h-4 w-4 rounded-full bg-white transition ${portfolioOnly ? "translate-x-5" : ""}`} />
        </button>
      </label>
    </div>
  );
}
