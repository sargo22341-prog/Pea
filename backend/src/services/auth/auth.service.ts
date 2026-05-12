// Rôle du fichier : gérer les comptes utilisateurs, les sessions, les
// préférences de profil et les icônes de profil stockées localement.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { DashboardSortKey, NewsLanguage, RangeKey, SortDirection, WatchlistSortKey } from "@pea/shared";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { HttpError } from "../../utils/http-error.js";
import { detectSupportedImageMime, isSupportedImageMime } from "../../utils/image-signature.js";

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "user";
  profileIconUrl?: string;
  hasProfileIcon?: boolean;
  dashboardDefaultSortKey: DashboardSortKey;
  dashboardDefaultSortDirection: SortDirection;
  watchlistDefaultSortKey: WatchlistSortKey;
  watchlistDefaultSortDirection: SortDirection;
  defaultChartRange: RangeKey;
  localPeaSearchEnabled: boolean;
  assetNewsEnabled: boolean;
  newsLanguages: NewsLanguage[];
  privacyModeEnabled: boolean;
  createdAt: string;
}

// Ligne brute renvoyée par SQLite pour la table users
interface LigneUtilisateur {
  id: number | string;
  username: string;
  role: string;
  profile_icon_url: string | null;
  profile_icon_path: string | null;
  has_profile_icon: number | null;
  password_hash: string;
  dashboard_default_sort_key: string;
  dashboard_default_sort_direction: string;
  watchlist_default_sort_key: string;
  watchlist_default_sort_direction: string;
  default_chart_range: string;
  local_pea_search_enabled: number | null;
  asset_news_enabled: number | null;
  news_language_fr_enabled: number | null;
  news_language_en_enabled: number | null;
  privacy_mode_enabled: number | null;
  created_at: string;
}

const dureeSessionJours = 30;
const dossierIconesProfil = path.resolve(path.dirname(config.sqlitePath), "profile-icons");
let dernierePurgeSessionsExpirees = 0;
const intervallePurgeSessionsExpireesMs = 60 * 60 * 1000;

fs.mkdirSync(dossierIconesProfil, { recursive: true });

function estCleTriTableauBord(valeur: unknown): valeur is DashboardSortKey {
  return valeur === "name" || valeur === "currentMarketValue" || valeur === "intervalPerformancePercent";
}

function estCleTriListeSuivi(valeur: unknown): valeur is WatchlistSortKey {
  return valeur === "name" || valeur === "price" || valeur === "performancePercent";
}

function estDirectionTri(valeur: unknown): valeur is SortDirection {
  return valeur === "asc" || valeur === "desc";
}

function estCleIntervalle(valeur: unknown): valeur is RangeKey {
  return (
    valeur === "1d" ||
    valeur === "1w" ||
    valeur === "1m" ||
    valeur === "1y" ||
    valeur === "5y" ||
    valeur === "10y" ||
    valeur === "ytd" ||
    valeur === "all"
  );
}

function extensionPourMime(typeMime: string) {
  if (typeMime.includes("jpeg") || typeMime.includes("jpg")) return "jpg";
  return "png";
}

function convertirLigneEnUtilisateur(ligne: LigneUtilisateur): AuthUser {
  const langues: NewsLanguage[] = [];
  if (ligne.news_language_fr_enabled === undefined || ligne.news_language_fr_enabled === null || Boolean(ligne.news_language_fr_enabled)) langues.push("fr");
  if (ligne.news_language_en_enabled) langues.push("en");

  return {
    id: Number(ligne.id),
    username: String(ligne.username),
    role: ligne.role === "admin" ? "admin" : "user",
    profileIconUrl: ligne.profile_icon_url ? String(ligne.profile_icon_url) : undefined,
    // Utilise la colonne has_profile_icon (mis à jour par les migrations et les opérations d'écriture)
    // pour éviter un appel fs.existsSync() synchrone à chaque requête authentifiée.
    hasProfileIcon: Boolean(ligne.has_profile_icon),
    dashboardDefaultSortKey: estCleTriTableauBord(ligne.dashboard_default_sort_key) ? ligne.dashboard_default_sort_key : "name",
    dashboardDefaultSortDirection: estDirectionTri(ligne.dashboard_default_sort_direction) ? ligne.dashboard_default_sort_direction : "asc",
    watchlistDefaultSortKey: estCleTriListeSuivi(ligne.watchlist_default_sort_key) ? ligne.watchlist_default_sort_key : "name",
    watchlistDefaultSortDirection: estDirectionTri(ligne.watchlist_default_sort_direction) ? ligne.watchlist_default_sort_direction : "asc",
    defaultChartRange: estCleIntervalle(ligne.default_chart_range) ? ligne.default_chart_range : "1d",
    localPeaSearchEnabled: ligne.local_pea_search_enabled === undefined || ligne.local_pea_search_enabled === null ? true : Boolean(ligne.local_pea_search_enabled),
    assetNewsEnabled: ligne.asset_news_enabled === undefined || ligne.asset_news_enabled === null ? true : Boolean(ligne.asset_news_enabled),
    newsLanguages: langues.length ? langues : ["fr"],
    privacyModeEnabled: Boolean(ligne.privacy_mode_enabled),
    createdAt: String(ligne.created_at)
  };
}

function hacherToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const nomCookieAuth = "pea_session";
// Alias conservé pour la compatibilité avec les imports existants
export const authCookieName = nomCookieAuth;

export class AuthService {
  purgerSessionsExpirees(force = false) {
    const maintenantMs = Date.now();
    if (!force && maintenantMs - dernierePurgeSessionsExpirees < intervallePurgeSessionsExpireesMs) return 0;
    dernierePurgeSessionsExpirees = maintenantMs;
    return db.prepare("DELETE FROM user_sessions WHERE expires_at <= ?").run(Math.floor(maintenantMs / 1000));
  }

  aDesUtilisateurs() {
    return Boolean(db.prepare("SELECT 1 FROM users LIMIT 1").get());
  }

  // Alias conservé pour la compatibilité avec les middlewares existants
  hasUsers() {
    return this.aDesUtilisateurs();
  }

  nombreUtilisateurs() {
    const ligne = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
    return Number(ligne.count);
  }

  async creerPremierCompte(nomUtilisateur: string, motDePasse: string, urlIconeProfil?: string) {
    if (this.aDesUtilisateurs()) throw new HttpError(409, "Le premier compte existe deja.");
    return this.creerUtilisateur(nomUtilisateur, motDePasse, urlIconeProfil);
  }

  // Alias conservé pour la compatibilité avec les routes existantes
  async setup(nomUtilisateur: string, motDePasse: string, urlIconeProfil?: string) {
    return this.creerPremierCompte(nomUtilisateur, motDePasse, urlIconeProfil);
  }

  async connecter(nomUtilisateur: string, motDePasse: string) {
    const ligne = db.prepare("SELECT * FROM users WHERE username = ?").get(nomUtilisateur.trim()) as LigneUtilisateur | undefined;
    if (!ligne || !(await bcrypt.compare(motDePasse, String(ligne.password_hash)))) {
      throw new HttpError(401, "Identifiants invalides.");
    }
    return { user: convertirLigneEnUtilisateur(ligne), token: this.creerSession(Number(ligne.id)) };
  }

  // Alias conservé pour la compatibilité avec les routes existantes
  async login(nomUtilisateur: string, motDePasse: string) {
    return this.connecter(nomUtilisateur, motDePasse);
  }

  deconnecter(token?: string) {
    if (!token) return;
    db.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(hacherToken(token));
  }

  // Alias conservé pour la compatibilité avec les routes existantes
  logout(token?: string) {
    return this.deconnecter(token);
  }

  utilisateurParSession(token?: string): AuthUser | undefined {
    if (!token) return undefined;
    const maintenant = Math.floor(Date.now() / 1000);
    this.purgerSessionsExpirees();
    const ligne = db
      .prepare(
        `SELECT users.*
         FROM user_sessions
         JOIN users ON users.id = user_sessions.user_id
         WHERE user_sessions.token_hash = ? AND user_sessions.expires_at > ?`
      )
      .get(hacherToken(token), maintenant);
    return ligne ? convertirLigneEnUtilisateur(ligne as LigneUtilisateur) : undefined;
  }

  // Alias conservé pour la compatibilité avec les middlewares existants
  getUserBySession(token?: string): AuthUser | undefined {
    return this.utilisateurParSession(token);
  }

  async mettreAJourUtilisateur(
    idUtilisateur: number,
    donnees: {
      username?: string;
      password?: string;
      profileIconUrl?: string | null;
      dashboardDefaultSortKey?: DashboardSortKey;
      dashboardDefaultSortDirection?: SortDirection;
      watchlistDefaultSortKey?: WatchlistSortKey;
      watchlistDefaultSortDirection?: SortDirection;
      defaultChartRange?: RangeKey;
      localPeaSearchEnabled?: boolean;
      assetNewsEnabled?: boolean;
      newsLanguages?: NewsLanguage[];
      privacyModeEnabled?: boolean;
    }
  ) {
    const actuel = db.prepare("SELECT * FROM users WHERE id = ?").get(idUtilisateur) as LigneUtilisateur | undefined;
    if (!actuel) throw new HttpError(404, "Utilisateur introuvable.");

    const nomUtilisateur = donnees.username?.trim() || String(actuel.username);
    const urlIconeProfil = donnees.profileIconUrl === undefined ? actuel.profile_icon_url : donnees.profileIconUrl || null;
    const hashMotDePasse = donnees.password ? await bcrypt.hash(donnees.password, 12) : String(actuel.password_hash);
    const cleTriTableauBord = donnees.dashboardDefaultSortKey ?? actuel.dashboard_default_sort_key ?? "name";
    const directionTriTableauBord = donnees.dashboardDefaultSortDirection ?? actuel.dashboard_default_sort_direction ?? "asc";
    const cleTriListeSuivi = donnees.watchlistDefaultSortKey ?? actuel.watchlist_default_sort_key ?? "name";
    const directionTriListeSuivi = donnees.watchlistDefaultSortDirection ?? actuel.watchlist_default_sort_direction ?? "asc";
    const intervalleParDefaut = donnees.defaultChartRange ?? actuel.default_chart_range ?? "1d";
    const rechercheLocaleActivee =
      donnees.localPeaSearchEnabled === undefined ? Number(actuel.local_pea_search_enabled ?? 1) : donnees.localPeaSearchEnabled ? 1 : 0;
    const actualitesActivees = donnees.assetNewsEnabled === undefined ? Number(actuel.asset_news_enabled ?? 1) : donnees.assetNewsEnabled ? 1 : 0;
    const languesValides = [...new Set((donnees.newsLanguages ?? []).filter((l): l is NewsLanguage => l === "fr" || l === "en"))];
    const languesFrActivee = donnees.newsLanguages === undefined ? Number(actuel.news_language_fr_enabled ?? 1) : languesValides.includes("fr") ? 1 : 0;
    const languesEnActivee = donnees.newsLanguages === undefined ? Number(actuel.news_language_en_enabled ?? 0) : languesValides.includes("en") ? 1 : 0;
    if (!languesFrActivee && !languesEnActivee) throw new HttpError(400, "Au moins une langue d'actualites doit etre activee.");
    const modePrive = donnees.privacyModeEnabled === undefined ? Number(actuel.privacy_mode_enabled ?? 0) : donnees.privacyModeEnabled ? 1 : 0;

    try {
      db.prepare(
        `UPDATE users
         SET username = ?,
             password_hash = ?,
             profile_icon_url = ?,
             dashboard_default_sort_key = ?,
             dashboard_default_sort_direction = ?,
             watchlist_default_sort_key = ?,
             watchlist_default_sort_direction = ?,
             default_chart_range = ?,
             local_pea_search_enabled = ?,
             asset_news_enabled = ?,
             news_language_fr_enabled = ?,
             news_language_en_enabled = ?,
             privacy_mode_enabled = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(
        nomUtilisateur,
        hashMotDePasse,
        urlIconeProfil,
        cleTriTableauBord,
        directionTriTableauBord,
        cleTriListeSuivi,
        directionTriListeSuivi,
        intervalleParDefaut,
        rechercheLocaleActivee,
        actualitesActivees,
        languesFrActivee,
        languesEnActivee,
        modePrive,
        idUtilisateur
      );
    } catch {
      throw new HttpError(409, "Ce username est deja utilise.");
    }

    // Invalide toutes les sessions actives de cet utilisateur lors d'un changement
    // de mot de passe, pour qu'un token volé ne reste pas valable après la modification.
    if (donnees.password) {
      db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(idUtilisateur);
    }

    return convertirLigneEnUtilisateur(db.prepare("SELECT * FROM users WHERE id = ?").get(idUtilisateur) as LigneUtilisateur);
  }

  // Alias conservé pour la compatibilité avec les routes existantes
  async updateUser(
    idUtilisateur: number,
    donnees: Parameters<AuthService["mettreAJourUtilisateur"]>[1]
  ) {
    return this.mettreAJourUtilisateur(idUtilisateur, donnees);
  }

  fichierIconeProfil(idUtilisateur: number) {
    const ligne = db.prepare("SELECT profile_icon_path, profile_icon_mime_type FROM users WHERE id = ?").get(idUtilisateur) as Pick<LigneUtilisateur, "profile_icon_path"> & { profile_icon_mime_type: string | null } | undefined;
    const cheminFichier = ligne?.profile_icon_path ? String(ligne.profile_icon_path) : undefined;
    const typeMime = ligne?.profile_icon_mime_type ? String(ligne.profile_icon_mime_type) : undefined;
    if (!cheminFichier || !typeMime || !fs.existsSync(cheminFichier)) return undefined;
    return { filePath: cheminFichier, mimeType: typeMime };
  }

  // Alias conservé pour la compatibilité avec les routes existantes
  getProfileIconFile(idUtilisateur: number) {
    return this.fichierIconeProfil(idUtilisateur);
  }

  sauvegarderIconeProfil(idUtilisateur: number, donnees: Buffer, _typeMime: string) {
    const actuel = db.prepare("SELECT profile_icon_path FROM users WHERE id = ?").get(idUtilisateur) as Pick<LigneUtilisateur, "profile_icon_path"> | undefined;
    if (!actuel) throw new HttpError(404, "Utilisateur introuvable.");

    const mimeNormalise = detectSupportedImageMime(donnees);
    if (!mimeNormalise) throw new HttpError(400, "Image invalide.");
    const cheminFichier = path.join(dossierIconesProfil, `user-${idUtilisateur}.${extensionPourMime(mimeNormalise)}`);
    for (const extension of ["png", "jpg"]) {
      const chemin = path.join(dossierIconesProfil, `user-${idUtilisateur}.${extension}`);
      if (chemin !== cheminFichier && fs.existsSync(chemin)) fs.unlinkSync(chemin);
    }

    fs.writeFileSync(cheminFichier, donnees);
    db.prepare(
      `UPDATE users
       SET profile_icon_path = ?, profile_icon_mime_type = ?, profile_icon_size = ?,
           profile_icon_url = NULL, has_profile_icon = 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(cheminFichier, mimeNormalise, donnees.length, idUtilisateur);
    return convertirLigneEnUtilisateur(db.prepare("SELECT * FROM users WHERE id = ?").get(idUtilisateur) as LigneUtilisateur);
  }

  // Alias conservé pour la compatibilité avec les routes existantes
  saveProfileIcon(idUtilisateur: number, donnees: Buffer, typeMime: string) {
    return this.sauvegarderIconeProfil(idUtilisateur, donnees, typeMime);
  }

  supprimerIconeProfil(idUtilisateur: number) {
    const actuel = db.prepare("SELECT profile_icon_path FROM users WHERE id = ?").get(idUtilisateur) as Pick<LigneUtilisateur, "profile_icon_path"> | undefined;
    if (!actuel) throw new HttpError(404, "Utilisateur introuvable.");
    const cheminFichier = actuel.profile_icon_path ? String(actuel.profile_icon_path) : undefined;
    if (cheminFichier && fs.existsSync(cheminFichier)) fs.unlinkSync(cheminFichier);
    db.prepare(
      `UPDATE users
       SET profile_icon_path = NULL, profile_icon_mime_type = NULL, profile_icon_size = NULL,
           profile_icon_url = NULL, has_profile_icon = 0, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(idUtilisateur);
  }

  // Alias conservé pour la compatibilité avec les routes existantes
  deleteProfileIcon(idUtilisateur: number) {
    return this.supprimerIconeProfil(idUtilisateur);
  }

  typeMimeIconeAutorise(typeMime: string) {
    return isSupportedImageMime(typeMime);
  }

  // Alias conservé pour la compatibilité avec les routes existantes
  isAllowedProfileIconMime(typeMime: string) {
    return this.typeMimeIconeAutorise(typeMime);
  }

  private async creerUtilisateur(nomUtilisateur: string, motDePasse: string, urlIconeProfil?: string) {
    const nomNormalise = nomUtilisateur.trim();
    if (!nomNormalise) throw new HttpError(400, "Username requis.");
    if (!motDePasse) throw new HttpError(400, "Mot de passe requis.");

    const hashMotDePasse = await bcrypt.hash(motDePasse, 12);
    const role = this.nombreUtilisateurs() === 0 ? "admin" : "user";
    db.prepare("INSERT INTO users (username, password_hash, role, profile_icon_url) VALUES (?, ?, ?, ?)").run(
      nomNormalise,
      hashMotDePasse,
      role,
      urlIconeProfil || null
    );
    const ligne = db.prepare("SELECT * FROM users WHERE username = ?").get(nomNormalise) as LigneUtilisateur;
    return { user: convertirLigneEnUtilisateur(ligne), token: this.creerSession(Number(ligne.id)) };
  }

  private creerSession(idUtilisateur: number) {
    this.purgerSessionsExpirees(true);
    const token = crypto.randomBytes(32).toString("base64url");
    const expireA = Math.floor(Date.now() / 1000) + dureeSessionJours * 24 * 60 * 60;
    db.prepare("INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(idUtilisateur, hacherToken(token), expireA);
    return token;
  }
}

export const authService = new AuthService();
