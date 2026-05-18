import type express from "express";

type AppLanguage = "fr" | "en";

const en: Record<string, string> = {
  "Données invalides": "Invalid data",
  "Erreur interne du serveur.": "Internal server error.",
  "Trop de requêtes vers l’API locale. Ralentissez quelques instants.": "Too many requests to the local API. Slow down for a moment.",
  "Authentification requise.": "Authentication required.",
  "Droits administrateur requis.": "Administrator rights required.",
  "Les mots de passe ne correspondent pas.": "Passwords do not match.",
  "Identifiants invalides.": "Invalid credentials.",
  "Utilisateur introuvable.": "User not found.",
  "Ce username est deja utilise.": "This username is already taken.",
  "Au moins une langue d'actualites doit etre activee.": "At least one news language must be enabled.",
  "Username requis.": "Username is required.",
  "Mot de passe requis.": "Password is required.",
  "Position introuvable": "Position not found",
  "Transaction introuvable": "Transaction not found",
  "La quantite doit etre strictement positive.": "Quantity must be strictly positive.",
  "Le prix doit etre positif ou nul.": "Price must be positive or zero.",
  "Cette vente rendrait la quantite detenue negative.": "This sale would make the held quantity negative."
};

function languageFromRequest(req: express.Request): AppLanguage {
  const userLanguage = req.user?.language;
  if (userLanguage === "fr" || userLanguage === "en") return userLanguage;
  return req.acceptsLanguages("en", "fr") === "en" ? "en" : "fr";
}

export function translateForRequest(req: express.Request, message: string) {
  return languageFromRequest(req) === "en" ? en[message] ?? message : message;
}
