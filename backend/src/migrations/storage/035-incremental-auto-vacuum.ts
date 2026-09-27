import type { Migration } from "../types.js";

/**
 * Les caches JSON et les candles intraday sont reecrits en continu : sans auto_vacuum, les pages
 * liberees restent dans le fichier (30 % d'une base reelle). Le mode incremental permet au
 * nettoyage periodique de rendre ces pages au disque. Le changement de mode ne prend effet
 * qu'apres un VACUUM complet, execute une seule fois ici (hors transaction, au demarrage).
 */
export const incrementalAutoVacuumMigration: Migration = {
  version: 35,
  description: "Active auto_vacuum incremental et compacte la base une fois",
  appliquer: (db) => {
    db.exec("PRAGMA auto_vacuum = INCREMENTAL");
    db.exec("VACUUM");
  },
  defaire: (db) => {
    db.exec("PRAGMA auto_vacuum = NONE");
    db.exec("VACUUM");
  }
};
