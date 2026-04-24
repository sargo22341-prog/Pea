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
- `YAHOO_CACHE_TTL_SECONDS`: duree du cache des cotations, defaut `300`
- `FRONTEND_DIST`: chemin du build frontend a servir en production
- `VITE_API_BASE_URL`: URL API utilisee par Vite en developpement
- `WAIT_FOR_HEALTH_TIMEOUT_MS`: timeout du script de demarrage dev, defaut `30000`

## Donnees de marche

L'application est pensee en mode cache-first:

- React appelle uniquement le backend local.
- Le backend lit SQLite en priorite.
- Yahoo Finance sert uniquement a rafraichir progressivement les donnees.
- Les quotes, historiques et dividendes sont mis en cache dans SQLite.
- Les appels Yahoo passent par Bottleneck avec `maxConcurrent=1` et `minTime=1200ms`.
- Les erreurs temporaires utilisent un retry avec backoff exponentiel.
- Si Yahoo retourne `429`, `401`, `Invalid Crumb`, `User is not logged in` ou `Edge: Too Many Requests`, le backend renvoie les dernieres donnees en cache si elles existent.
- Les donnees issues d'un cache perime sont marquees `stale` et l'UI affiche `Donnees differees`.
- Le code passe par une abstraction `MarketDataProvider`, pour pouvoir remplacer Yahoo plus tard par EODHD, Twelve Data, Alpha Vantage ou une autre API.

## Limites Yahoo Finance

Yahoo Finance ne garantit pas la disponibilite exhaustive des dividendes, ni les calendriers futurs pour tous les titres. L'application utilise les dividendes reels quand ils sont fournis et estime les prochains versements a partir de l'annee precedente lorsqu'aucune donnee future fiable n'est disponible.

Les informations d'eligibilite PEA ne sont pas verifiees par Yahoo Finance: les resultats sont donc affiches avec le badge `Eligibilite PEA inconnue`, avec une structure prevue pour brancher plus tard une base locale.

## API

- `GET /api/search?q=`
- `GET /api/quote/:symbol`
- `GET /api/history/:symbol?range=`
- `GET /api/dividends/:symbol`
- `GET /api/portfolio`
- `POST /api/portfolio/positions`
- `GET /api/portfolio/performance?range=`
- `GET /api/portfolio/dividends`

## Notes

Cette premiere version privilegie le dashboard, l'ajout de position, les donnees Yahoo Finance, le graphique de portefeuille et la page dividendes. Le code est decoupe en services pour permettre l'ajout ulterieur d'une base locale d'eligibilite PEA, d'authentification ou d'imports de transactions.
