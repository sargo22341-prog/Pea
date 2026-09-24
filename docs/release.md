# Release automatique

Le dépôt de référence est sur GitHub. Le workflow unique `.github/workflows/ci.yml` vérifie chaque
changement et publie une version à chaque push sur `main`.

## Vérification (`verify`)

Sur **chaque pull request et chaque push** :

- `npm ci` puis `npm audit --omit=dev --audit-level=high` ;
- `npm run typecheck`, `npm run lint`, `npm run quality:architecture` ;
- `npm test` (backend, frontend et scripts de release) ;
- `npm run build` ;
- build de l'image Docker `backend/Dockerfile`, sans publication (le cache sert ensuite au job
  de publication).

## Publication (sur `main` uniquement, si la vérification passe)

1. **`release`**
   1. `scripts/release/bump-version.mjs` incrémente la version (patch par défaut) dans les
      quatre `package.json`, `package-lock.json` et les valeurs par défaut de
      `frontend/android/app/build.gradle` ;
   2. `scripts/release/release-notes.mjs` relève les notes de `RELEASE_NOTES.md` puis vide la
      liste ;
   3. construit les assets web Android et compile `assembleRelease` signé ; la signature, le
      `versionName` et le `versionCode` de l'APK sont vérifiés ;
   4. committe `chore: bump version to vX.Y.Z [skip ci]` (version montée **et** notes vidées),
      crée le tag annoté `vX.Y.Z` et pousse les deux de façon atomique.
2. **`docker`** : construit l'image depuis le tag et la publie sur
   `ghcr.io/<propriétaire>/pea-portfolio` avec les tags `X.Y.Z` et `latest`.
3. **`publish`** : crée la GitHub Release `vX.Y.Z` avec `pea-portfolio-X.Y.Z.apk` ; sa
   description est le texte relevé à l'étape 1.2 (ou la liste des commits générée par GitHub s'il
   était vide), suivie de la référence de l'image Docker.

**Actions → CI → Run workflow** sur `main` permet de choisir `minor` ou `major` au lieu de
`patch`.

Si `docker` ou `publish` échoue, le tag est déjà poussé : utiliser **Re-run failed jobs**, qui
reprend depuis le tag sans remonter la version.

## Version

La version `X.Y.Z` est commune aux paquets npm, à l'image Docker et à l'APK. Le `versionCode`
Android vaut `X × 1 000 000 + Y × 10 000 + Z × 100` : la mineure et le patch doivent rester
≤ 99 (au-delà, le bump échoue ; passer par `minor` ou `major`). Ne pas modifier la version à la
main : elle n'est montée que par la CI.

## Notes de version

Écrire les changements dans `RELEASE_NOTES.md`, à la racine, **sous** la ligne `<!-- notes -->`
(une ligne `- …` par changement, en français, compréhensible par un utilisateur), et les committer
avec le travail concerné. Ce qui précède le marqueur est conservé. Si le marqueur est supprimé, le
job `release` échoue avant toute publication.

Les notes ne sont vidées que dans le commit de version : si son push est refusé, elles restent en
place et partent avec la release suivante. Après une release, faire `git pull` avant d'ajouter de
nouvelles notes, sinon la liste vidée par la CI entre en conflit.

## Exécution et concurrence

Le commit de version, poussé avec le jeton du workflow, ne relance pas la CI. Deux releases ne
tournent jamais en parallèle (`concurrency: release-main`). Si `main` a avancé pendant le build,
le push atomique est refusé et rien n'est publié : le push suivant produit la version. Si `main`
est protégée, autoriser GitHub Actions à y pousser.

## Secrets à créer

Settings → Secrets and variables → Actions :

| Secret | Contenu |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | le keystore de signature encodé en base64 |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe du keystore |
| `ANDROID_KEY_ALIAS` | alias de la clé |
| `ANDROID_KEY_PASSWORD` | mot de passe de la clé |

Encodage sans fichier intermédiaire, puis coller le presse-papiers dans le secret :

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("chemin\vers\pea-release.keystore")) | Set-Clipboard
```

Sans l'un de ces secrets, le job `release` échoue avant toute montée de version : aucune release
non signée n'est publiée. La clé est décodée dans le dossier temporaire du runner puis supprimée
à la fin du job. La publication sur ghcr.io utilise le jeton du workflow (`packages: write`).
