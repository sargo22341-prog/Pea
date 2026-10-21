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
  "Cette vente rendrait la quantite detenue negative.": "This sale would make the held quantity negative.",
  "Cette suppression rendrait la quantite detenue negative.": "This deletion would make the held quantity negative.",
  "Requete invalide.": "Invalid request.",
  "Solde especes insuffisant.": "Insufficient cash balance.",
  "Cette operation ne peut pas etre financee par un versement.": "This operation cannot be funded by a deposit.",
  "Le versement serait anterieur a la date de l'etat initial du compte especes.": "The deposit would predate the cash account's initial state.",
  "Configurez d'abord le compte especes du PEA.": "Set up the PEA cash account first.",
  "Ce versement ou retrait est anterieur a la date de l'etat initial : corrigez plutot l'etat initial.": "This deposit or withdrawal predates the initial state: correct the initial state instead.",
  "Des versements ou retraits enregistres sont anterieurs a cette date de reference.": "Recorded deposits or withdrawals predate this reference date.",
  "Avec cet etat initial, le solde especes deviendrait negatif.": "With this initial state, the cash balance would become negative.",
  "Seuls des frais peuvent etre finances par un versement.": "Only fees can be funded by a deposit.",
  "Mouvement introuvable.": "Movement not found.",
  "La date ne peut pas etre dans le futur.": "The date cannot be in the future.",
  "Cet avis d'opere a deja ete importe.": "This trade confirmation has already been imported.",
  "Une operation identique existe deja sur cette position. Confirmez pour l'enregistrer une seconde fois.": "An identical operation already exists on this position. Confirm to record it a second time.",
  "Le meme fichier a ete fourni deux fois dans le lot.": "The same file was provided twice in the batch.",
  "Plusieurs operations identiques sont deja enregistrees : rien n'est cree ni modifie.": "Several identical operations are already recorded: nothing is created or changed.",
  "Code de configuration invalide.": "Invalid setup code.",
  "Yahoo Finance est temporairement indisponible ou limite les requetes.": "Yahoo Finance is temporarily unavailable or rate limiting requests.",
  "Yahoo Finance est temporairement indisponible (circuit breaker ouvert).": "Yahoo Finance is temporarily unavailable (circuit breaker open).",
  "Yahoo Finance est temporairement indisponible (file d'appels saturee ou trop lente).": "Yahoo Finance is temporarily unavailable (request queue full or too slow)."
};

function languageFromRequest(req: express.Request): AppLanguage {
  const userLanguage = req.user?.language;
  if (userLanguage === "fr" || userLanguage === "en") return userLanguage;
  return req.acceptsLanguages("en", "fr") === "en" ? "en" : "fr";
}

export function translateForRequest(req: express.Request, message: string) {
  return languageFromRequest(req) === "en" ? en[message] ?? message : message;
}
