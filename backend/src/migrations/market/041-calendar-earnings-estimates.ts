import type { Migration } from "../types.js";

/** Consensus BPA et chiffre d'affaires de la prochaine publication, affichés dans le calendrier. */
export const calendarEarningsEstimatesMigration: Migration = {
  version: 41,
  description: "Ajoute les estimations de publication aux evenements du calendrier",
  appliquer: (db) => {
    const columns = (db.prepare("PRAGMA table_info(asset_calendar_events)").all() as { name: string }[]).map((column) => column.name);
    if (!columns.includes("eps_average")) db.exec("ALTER TABLE asset_calendar_events ADD COLUMN eps_average REAL");
    if (!columns.includes("revenue_average")) db.exec("ALTER TABLE asset_calendar_events ADD COLUMN revenue_average REAL");
  }
};
