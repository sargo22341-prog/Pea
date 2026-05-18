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
import commonEn from "./locales/en/common.json";
import navigationEn from "./locales/en/navigation.json";
import dashboardEn from "./locales/en/dashboard.json";
import portfolioEn from "./locales/en/portfolio.json";
import assetEn from "./locales/en/asset.json";
import settingsEn from "./locales/en/settings.json";
import errorsEn from "./locales/en/errors.json";

export const namespaces = ["common", "navigation", "dashboard", "portfolio", "asset", "settings", "errors"] as const;

export const languageOptions: Array<{ code: AppLanguage; labelKey: string; flag: string }> = [
  { code: "fr", labelKey: "languages.fr", flag: "FR" },
  { code: "en", labelKey: "languages.en", flag: "EN" }
];

const resources = {
  fr: {
    common: commonFr,
    navigation: navigationFr,
    dashboard: dashboardFr,
    portfolio: portfolioFr,
    asset: assetFr,
    settings: settingsFr,
    errors: errorsFr
  },
  en: {
    common: commonEn,
    navigation: navigationEn,
    dashboard: dashboardEn,
    portfolio: portfolioEn,
    asset: assetEn,
    settings: settingsEn,
    errors: errorsEn
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
  "Cette vente rendrait la quantite detenue negative.": "saleWouldMakeQuantityNegative"
};

function initialLanguage(): AppLanguage {
  const storage = typeof window !== "undefined" ? window.localStorage : undefined;
  const stored = typeof storage?.getItem === "function" ? storage.getItem("pea.language") : undefined;
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
    if (typeof window.localStorage?.setItem === "function") window.localStorage.setItem("pea.language", language);
  }
});

export function translateApiMessage(message: string) {
  const key = legacyErrorKeys[message.trim()];
  return key ? i18n.t(`errors:${key}`) : message;
}

export { i18n };
export default i18n;
