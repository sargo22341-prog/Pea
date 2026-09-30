# Notes de la prochaine version

Écrire sous la ligne `<!-- notes -->` les changements de la prochaine version, en français et en
Markdown (une ligne `- …` par changement). À chaque push sur `main`, la CI publie ce texte comme
description de la GitHub Release, puis vide la liste dans le commit `chore: bump version to vX.Y.Z`.
Sans notes, GitHub génère la liste des commits. Détails : [docs/release.md](docs/release.md).

<!-- notes -->

- **Mise à jour Docker à lire** : l'exemple `docker-compose.yml` utilise désormais un volume nommé `pea-data`. Si vos données étaient dans `/data`, ajoutez `PEA_DATA_DIR=/data` à votre `.env` avant de redémarrer.
- La création du premier compte exige un code de configuration affiché dans les logs du serveur (ou défini par `SETUP_CODE`) : une instance exposée avant sa configuration ne peut plus être revendiquée par un inconnu.
- Import CSV Boursorama : un import « remplacer » ou une mise à jour est maintenant réellement pris en compte, sous forme de transactions d'ajustement datées de l'import ; l'historique existant est conservé et une vente ultérieure part bien de la quantité importée. Les écritures d'un import sont faites en une seule fois (tout ou rien).
- Import CSV et PDF : les confirmations jusqu'à 1 000 lignes ne sont plus refusées pour taille excessive, et l'application attend jusqu'à 5 minutes les aperçus longs au lieu d'abandonner après 20 s.
- Avis d'opéré PDF : les doublons sont détectés aussi face aux transactions saisies à la main et quand le même avis est envoyé deux fois dans un import ; l'analyse des PDF ne bloque plus le serveur.
- Yahoo Finance : un appel bloqué est abandonné après 15 s et la file d'attente est bornée ; si Yahoo est injoignable, l'ajout à la liste de suivi et le recalcul des objectifs continuent en mode dégradé au lieu d'échouer.
- Le conteneur Docker exécute le serveur sous l'utilisateur `node` (les droits du dossier de données sont corrigés au démarrage) et s'arrête proprement : tâches en cours terminées, base SQLite fermée. Le contrôle de santé suit la variable `PORT`.
- Les fichiers de logs tournent à 5 Mo (3 archives conservées) et sont écrits sans bloquer le serveur.
- Sécurité : temps de réponse identique à la connexion que le compte existe ou non, noms d'utilisateur uniques sans tenir compte de la casse, flux temps réel limités à 10 par utilisateur et fermés à la déconnexion ou au changement de mot de passe, récupération des icônes d'actifs limitée par utilisateur et téléchargement des favicons plafonné à 1 Mo.
- Une URL d'API inconnue répond 404 pour tous (et non plus 403 pour les non-administrateurs) ; les symboles sont validés de la même façon sur toutes les routes.
- Un avertissement est écrit dans les logs si un reverse proxy est détecté alors que `TRUST_PROXY` est désactivé.
- Android : seul le serveur configuré est accepté avec un certificat auto-signé (les serveurs précédemment saisis ne le sont plus), et les journaux détaillés des connexions ne sont plus écrits en version release.
- Icônes PWA aux dimensions exactes (192 et 512 px).
