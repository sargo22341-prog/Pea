# PEA Portfolio

Application web full-stack pour suivre un portefeuille PEA actions et ETF.

## Stack

- Frontend: React, TypeScript, Vite, TailwindCSS, Recharts
- Backend: Node.js, Express, TypeScript
- Donnees marche: `yahoo-finance2`, appele uniquement depuis le backend
- Persistance: SQLite
- Production: Docker Compose, frontend statique servi par Express

## Installation

```bash
npm install
npm run build
```

## Developpement

```bash
cp .env.example .env
npm run dev
```

Frontend: http://localhost:5173  
Backend API: http://localhost:4000

Si Vite affiche `ECONNREFUSED` sur `/api/*`, le backend n'ecoute pas encore sur le port `4000`. Lancez `npm run dev` a la racine, ou verifiez separement avec `npm run dev:backend` puis `npm run dev:frontend`.

Si le backend affiche `EADDRINUSE`, le port `4000` est deja utilise. Sous PowerShell:

```powershell
netstat -ano | Select-String ':4000'
Get-Process -Id <PID>
Stop-Process -Id <PID>
```

Vous pouvez aussi changer `PORT` dans `.env`, mais il faudra adapter le proxy Vite si vous n'utilisez plus `4000`.

## Production Docker

```bash
docker compose up --build
```

L'application est accessible sur http://localhost:4000.

## CI Gitea

Le workflow `.gitea/workflows/docker-release.yml`:

- lance `npm ci`, `npm run typecheck` et `npm run build`;
- build l'image Docker avec `backend/Dockerfile`;
- sur declenchement manuel, monte la version `patch`, `minor` ou `major`, commit le changement et cree un tag `vX.Y.Z`;
- publie l'image si `publish=true` ou si le workflow est lance sur un tag `v*`.

Variables et secrets attendus cote Gitea:

- `DOCKER_REGISTRY`: registre Docker sans protocole, par exemple `registry.example.com/mon-org`;
- `DOCKER_USERNAME`: utilisateur du registre;
- `DOCKER_PASSWORD`: mot de passe ou token du registre.

## Variables d'environnement

- `PORT`: port du serveur Express, defaut `4000`
- `SQLITE_PATH`: chemin du fichier SQLite, defaut `./data/pea.sqlite`
- `FRONTEND_DIST`: chemin du build frontend a servir en production
- `VITE_API_BASE_URL`: URL API utilisee par Vite en developpement
- `WAIT_FOR_HEALTH_TIMEOUT_MS`: timeout du script de demarrage dev, defaut `30000`

## Donnees de marche

L'application est pensee en mode cache-first:

- React appelle uniquement le backend local.
- Le backend lit SQLite en priorite.
- Yahoo Finance sert uniquement a rafraichir progressivement les donnees.
- Les quotes, historiques et dividendes sont mis en cache dans SQLite.
- La vue historique `1J` utilise `yahooFinance.chart` en intervalle `2m`, bornee a la seance Euronext Paris courante ou precedente, sans demander de donnees futures.
- Le cache intraday est journalier (`symbol`, `range=1d`, `interval=2m`, `tradingDay`) et peut servir de fallback stale si Yahoo echoue.
- Les appels Yahoo passent par un rate limiter Bottleneck centralise avec `maxConcurrent=1` et `minTime=250ms`.
- Les erreurs temporaires utilisent un retry avec backoff exponentiel.
- Si Yahoo retourne `429`, `401`, `Invalid Crumb`, `User is not logged in` ou `Edge: Too Many Requests`, le backend renvoie les dernieres donnees en cache si elles existent.
- Les donnees issues d'un cache perime sont marquees `stale` et l'UI affiche `Donnees differees`.
- Le code passe par une abstraction `MarketDataProvider`, pour pouvoir remplacer Yahoo plus tard par EODHD, Twelve Data, Alpha Vantage ou une autre API.

## Limites Yahoo Finance

Yahoo Finance ne garantit pas la disponibilite exhaustive des dividendes, ni les calendriers futurs pour tous les titres. L'application utilise les dividendes reels quand ils sont fournis et estime les prochains versements a partir de l'annee precedente lorsqu'aucune donnee future fiable n'est disponible.

Les informations d'eligibilite PEA ne sont pas verifiees par Yahoo Finance: les resultats sont donc affiches avec le badge `Eligibilite PEA inconnue`, avec une structure prevue pour brancher plus tard une base locale.

## API

- `POST /api/auth/setup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PATCH /api/auth/me`
- `GET /api/search?q=`
- `GET /api/quote/:symbol`
- `GET /api/history/:symbol?range=`
- `GET /api/dividends/:symbol`
- `GET /api/assets/:symbol/icon`
- `POST /api/assets/:symbol/icon`
- `DELETE /api/assets/:symbol/icon`
- `GET /api/portfolio`
- `POST /api/portfolio/positions`
- `GET /api/portfolio/performance?range=`
- `GET /api/portfolio/dividends`
- `POST /api/import/boursorama/preview`
- `POST /api/import/boursorama/confirm`
- `POST /api/import/avis-operes/preview`
- `POST /api/import/avis-operes/confirm`

## Notes

Le premier lancement affiche la creation du compte local. Les mots de passe sont hashes avec bcrypt et l'acces API prive passe par un cookie de session `httpOnly`.

Les icones d'actifs sont chargees en lazy: l'app cherche d'abord une icone manuelle, puis le cache, puis le site `assetProfile.website` via Yahoo pour generer un favicon. En cas d'echec, l'UI affiche les initiales du ticker.

L'import CSV Boursorama accepte les nombres francais, les noms entre guillemets et une preview corrigeable avant confirmation. Les lignes invalides remontent leurs erreurs sans interrompre toute la preview.

L'import PDF d'avis d'operes est optionnel et conserve le flux CSV existant. Le backend extrait le texte des PDF non scannes avec `pdf-parse`, parse les operations dans `avisOperesParser.service.ts`, puis renvoie une preview editable avant validation. Les operations validees sont stockees comme transactions datees (`source = pdf_avis_opere`) ; les calculs les utilisent lorsqu'elles existent pour un actif, sinon le mode legacy CSV sans dates reste applique.
