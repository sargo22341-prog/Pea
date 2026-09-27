# Notes de la prochaine version

Écrire sous la ligne `<!-- notes -->` les changements de la prochaine version, en français et en
Markdown (une ligne `- …` par changement). À chaque push sur `main`, la CI publie ce texte comme
description de la GitHub Release, puis vide la liste dans le commit `chore: bump version to vX.Y.Z`.
Sans notes, GitHub génère la liste des commits. Détails : [docs/release.md](docs/release.md).

<!-- notes -->

- update Package
- Import Boursorama : l'ISIN reconnu par Yahoo est désormais prioritaire sur la recherche par nom de l'actif.
- Qualité : contrôles TypeScript et ESLint renforcés au maximum sur tout le projet, sans aucun avertissement restant.
- Graphiques et écrans d'administration fiabilisés (couleurs des graphiques, chargements et rafraîchissements des données).
- Courbes beaucoup plus rapides : le tableau de bord en 1 jour s'affiche en quelques dizaines de millisecondes au lieu de 3 secondes, la fiche d'un actif et le recalcul des objectifs sont eux aussi nettement accélérés.
- Tableau de bord : les positions et la watchlist se chargent en même temps que la courbe au lieu de l'attendre.
- Fiche actif : changer de période ne recharge plus que la courbe et la performance de la position ; l'historique long d'un actif est allégé (1 000 points au maximum) sans perdre les pics.
- Le serveur reste réactif pendant les rafraîchissements en séance.
- Base de données plus compacte : suppression d'index en double et récupération automatique de l'espace libéré (migration appliquée au démarrage, avec un compactage unique).
- Courbe du portefeuille : une transaction enregistrée sans fuseau horaire est désormais placée au bon moment de la journée.
