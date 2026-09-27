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
