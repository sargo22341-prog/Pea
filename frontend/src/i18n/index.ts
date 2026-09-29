import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { AppLanguage } from "@pea/shared";
import commonFr from "./locales/fr/common.json";
import navigationFr from "./locales/fr/navigation.json";
import dashboardFr from "./locales/fr/dashboard.json";
import portfolioFr from "./locales/fr/portfolio.json";
import assetFr from "./locales/fr/asset.json";
import settingsFr from "./locales/fr/settings.json";
import errorsFr from "./locales/fr/errors.json";
import objectivesFr from "./locales/fr/objectives.json";
import calendarFr from "./locales/fr/calendar.json";
import marketsFr from "./locales/fr/markets.json";
import compareFr from "./locales/fr/compare.json";
import screenerFr from "./locales/fr/screener.json";
import alertsFr from "./locales/fr/alerts.json";
import commonEn from "./locales/en/common.json";
import navigationEn from "./locales/en/navigation.json";
import dashboardEn from "./locales/en/dashboard.json";
import portfolioEn from "./locales/en/portfolio.json";
import assetEn from "./locales/en/asset.json";
import settingsEn from "./locales/en/settings.json";
import errorsEn from "./locales/en/errors.json";
import objectivesEn from "./locales/en/objectives.json";
import calendarEn from "./locales/en/calendar.json";
import marketsEn from "./locales/en/markets.json";
import compareEn from "./locales/en/compare.json";
import screenerEn from "./locales/en/screener.json";
import alertsEn from "./locales/en/alerts.json";

export const namespaces = ["common", "navigation", "dashboard", "portfolio", "asset", "settings", "errors", "objectives", "calendar", "markets", "compare", "screener", "alerts"] as const;

export const languageOptions: { code: AppLanguage; labelKey: string; flag: string }[] = [
  { code: "fr", labelKey: "languages.fr", flag: "🇫🇷" },
  { code: "en", labelKey: "languages.en", flag: "🇬🇧" }
];

const resources = {
  fr: {
    common: commonFr,
    navigation: navigationFr,
    dashboard: dashboardFr,
    portfolio: portfolioFr,
    asset: assetFr,
    settings: settingsFr,
    errors: errorsFr,
    objectives: objectivesFr,
    calendar: calendarFr,
    markets: marketsFr,
    compare: compareFr,
    screener: screenerFr,
    alerts: alertsFr
  },
  en: {
    common: commonEn,
    navigation: navigationEn,
    dashboard: dashboardEn,
    portfolio: portfolioEn,
    asset: assetEn,
    settings: settingsEn,
    errors: errorsEn,
    objectives: objectivesEn,
    calendar: calendarEn,
    markets: marketsEn,
    compare: compareEn,
    screener: screenerEn,
    alerts: alertsEn
  }
};

const legacyErrorKeys: Record<string, string> = {
  "DonnÃƒÂ©es invalides": "invalidData",
  "DonnÃ©es invalides": "invalidData",
  "Données invalides": "invalidData",
  "Erreur interne du serveur.": "internalServer",
  "Trop de requetes en cours.": "tooManyRequestsInProgress",
  "URL serveur non configuree.": "serverUrlNotConfigured",
  "Identifiants invalides.": "invalidCredentials",
  "Authentification requise.": "authRequired",
  "Droits administrateur requis.": "adminRequired",
  "Utilisateur introuvable.": "userNotFound",
  "Ce username est deja utilise.": "usernameTaken",
  "Position introuvable": "positionNotFound",
  "Transaction introuvable": "transactionNotFound",
  "La quantite doit etre strictement positive.": "quantityStrictlyPositive",
  "Le prix doit etre positif ou nul.": "pricePositiveOrZero",
  "Cette vente rendrait la quantite detenue negative.": "saleWouldMakeQuantityNegative",
  "Cette suppression rendrait la quantite detenue negative.": "deletionWouldMakeQuantityNegative",
  "Requete invalide.": "invalidRequest"
};

/** Stockage local de la langue ; absent hors navigateur ou si l'acces est refuse (stockage desactive). */
function languageStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function initialLanguage(): AppLanguage {
  const stored = languageStorage()?.getItem("pea.language");
  if (stored === "fr" || stored === "en") return stored;
  return "fr";
}

void i18n.use(initReactI18next).init({
  defaultNS: "common",
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
  lng: initialLanguage(),
  ns: namespaces,
  resources
});

i18n.on("languageChanged", (language) => {
  if (language === "fr" || language === "en") {
    if (typeof document !== "undefined") document.documentElement.lang = language;
    languageStorage()?.setItem("pea.language", language);
  }
});

export function translateApiMessage(message: string) {
  const key = legacyErrorKeys[message.trim()];
  return key ? i18n.t(`errors:${key}`) : message;
}

export { i18n };
export default i18n;
