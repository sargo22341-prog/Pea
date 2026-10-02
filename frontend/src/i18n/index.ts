import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { AppLanguage } from "@pea/shared";
import { frResources } from "./resources-fr";

export const namespaces = ["common", "navigation", "dashboard", "portfolio", "asset", "settings", "errors", "objectives", "calendar", "markets", "compare", "screener", "alerts"] as const;

export const languageOptions: { code: AppLanguage; labelKey: string; flag: string }[] = [
  { code: "fr", labelKey: "languages.fr", flag: "🇫🇷" },
  { code: "en", labelKey: "languages.en", flag: "🇬🇧" }
];

/** Chargeurs des langues hors repli : chaque langue forme un chunk téléchargé à la première utilisation. */
const languageLoaders: Record<Exclude<AppLanguage, "fr">, () => Promise<Record<string, object>>> = {
  en: () => import("./resources-en").then((module) => module.enResources)
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
  partialBundledLanguages: true,
  resources: { fr: frResources }
});

/** Ajoute les traductions d'une langue si elles ne sont pas encore chargées. */
async function loadLanguageResources(language: AppLanguage) {
  if (language === "fr" || i18n.hasResourceBundle(language, "common")) return;
  const resources = await languageLoaders[language]();
  for (const [namespace, bundle] of Object.entries(resources)) {
    i18n.addResourceBundle(language, namespace, bundle, true, true);
  }
}

/**
 * Change la langue de l'interface après avoir chargé ses traductions. Si le chargement échoue
 * (réseau coupé), l'interface reste dans la langue courante plutôt que d'afficher des clés.
 */
export async function changeAppLanguage(language: AppLanguage) {
  try {
    await loadLanguageResources(language);
  } catch (error) {
    console.error("[i18n] traductions indisponibles, langue conservee", { language, error });
    return;
  }
  await i18n.changeLanguage(language);
}

/** Résolue quand la langue initiale est prête : le premier rendu attend pour éviter un flash en français. */
export const i18nReady: Promise<void> = changeAppLanguage(initialLanguage());

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
