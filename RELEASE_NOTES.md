# Notes de la prochaine version

Écrire sous la ligne `<!-- notes -->` les changements de la prochaine version, en français et en
Markdown (une ligne `- …` par changement). À chaque push sur `main`, la CI publie ce texte comme
description de la GitHub Release, puis vide la liste dans le commit `chore: bump version to vX.Y.Z`.
Sans notes, GitHub génère la liste des commits. Détails : [docs/release.md](docs/release.md).

<!-- notes -->

- Actualiser les bibliothèques de configuration et de traduction pour bénéficier de leurs derniers correctifs.
- Conserver la CLI Android Capacitor 8.4.3 pour éviter la dépendance Xcode vulnérable des versions 8.5 actuelles.
