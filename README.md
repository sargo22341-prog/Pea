<p align="center">
  <img src="./docs/logo.png" width="120" alt="PEA Portfolio logo" />
</p>

<h1 align="center">PEA Portfolio</h1>

Application auto-hebergee pour suivre un portefeuille PEA : positions, valorisation,
dividendes, actualites, graphiques de marche et analyses.

## Warning

> [!WARNING]
> Ce projet est **vibe-code**. 
> Utilisez-le uniquement en local, sur un reseau prive ou derriere une protection
> que vous maitrisez.

## Presentation du projet

PEA Portfolio est une application web full-stack pour suivre un Plan d'Epargne en
Actions en local. Le frontend React affiche un tableau de bord sombre et lisible,
tandis que le backend Express stocke les donnees dans SQLite et recupere les
cotations, historiques, dividendes et actualites via Yahoo Finance.

L'objectif est simple : garder ses donnees chez soi, visualiser rapidement la
performance du portefeuille et disposer d'une vue detaillee par actif sans passer
par un service tiers.

Fonctionnalites principales :

- dashboard de portefeuille avec positions, watchlist, performance et calendrier ;
- fiche detaillee par actif avec historique, informations marche et dividendes ;
- vue annuelle des dividendes avec repartition mensuelle et trimestrielle ;
- actualites Yahoo Finance, filtrables sur les actifs suivis ;
- imports Boursorama CSV et avis d'operes PDF ;
- mode prive pour masquer les montants personnels.

### Apercu

| Dashboard | Detail actif |
|---|---|
| ![Dashboard PEA Portfolio](docs/images/home.png) | ![Detail d'un actif](docs/images/asset-detail.png) |

| Dividendes | Actualites |
|---|---|
| ![Vue dividendes](docs/images/dividendes.png) | ![Vue actualites](docs/images/actualites.png) |

## Docker

Le deploiement Docker sert le frontend et l'API depuis le meme conteneur. Le
frontend est disponible sur `/`, l'API sur `/api`, et la base SQLite est
persistante dans `/app/data`.

Exemple de `docker-compose.yml` :

```yaml
services:
  pea-portfolio:
    image: ${DOCKER_REGISTRY:-}/pea-portfolio:${IMAGE_TAG:-latest}
    environment:
      NODE_ENV: production
      PORT: 4000
      SQLITE_PATH: /app/data/pea.sqlite
      FRONTEND_DIST: /app/frontend-dist
      DEBUG: "false"
      PUBLIC_URL: ${PUBLIC_URL:-}
      TRUST_PROXY: ${TRUST_PROXY:-false}
      CORS_ORIGINS: ${CORS_ORIGINS:-}
      LOGO_DEV_API_KEY: ${LOGO_DEV_API_KEY:-}
      TZ: Europe/Paris
    volumes:
      - ./data:/app/data
    ports:
      - "4000:4000"
    restart: unless-stopped
```

Lancement :

```bash
docker compose up -d
```

Puis ouvrir `http://localhost:4000`.

## Env

Copiez `.env.example` vers `.env` pour le developpement local.

```bash
cp .env.example .env
```

| Variable | Defaut | Utilisation |
|---|---:|---|
| `NODE_ENV` | `development` | Mode Node. En Docker, utilisez `production`. |
| `PORT` | `4000` | Port du serveur Express. |
| `SQLITE_PATH` | `./data/pea.sqlite` | Chemin du fichier SQLite. En Docker : `/app/data/pea.sqlite`. |
| `TZ` | `Europe/Paris` | Fuseau horaire des calculs de marche. |
| `DEBUG` | `false` | Active les logs et options de debug. |
| `DEBUG_DATE` | vide | Force une date pour tester les comportements temporels. |
| `FRONTEND_DIST` | `../frontend/dist` | Chemin du build frontend servi par le backend. |
| `CHART_CONFIG_PATH` | `data/config.json` | Chemin du fichier de configuration des graphiques. |
| `ENABLE_MARKET_LIVE_REFRESH` | `false` | Active le rafraichissement live des donnees de marche. |
| `PUBLIC_URL` | vide | Origine publique attendue, par exemple `https://pea.example.com`. |
| `TRUST_PROXY` | `false` | Active la confiance dans `X-Forwarded-*` derriere un reverse proxy fiable. |
| `CORS_ORIGINS` | `https://localhost` | Origines cross-origin autorisees, separees par des virgules. Utile pour l'APK Capacitor. |
| `VITE_API_BASE_URL` | `http://localhost:4000` | URL du backend utilisee par le frontend en developpement. |
| `WAIT_FOR_HEALTH_TIMEOUT_MS` | `30000` | Timeout du script local qui attend `/health` avant de lancer Vite. |
| `LOGO_DEV_API_KEY` | vide | Cle optionnelle pour recuperer automatiquement des logos d'actifs. |
| `PEA_AUTH_BACKOFF_BASE_MS` | `1000` | Base du backoff auth, seulement prise en compte en environnement `test`. |
| `PEA_AUTH_BACKOFF_MAX_MS` | `30000` | Maximum du backoff auth, seulement pris en compte en environnement `test`. |
| `DOCKER_REGISTRY` | vide | Prefixe optionnel du registre Docker dans `docker-compose.yml`. |
| `IMAGE_TAG` | `latest` | Tag d'image Docker utilise par `docker-compose.yml`. |

## Developpement local

Prerequis : Node.js 20+ et npm 10+.

```bash
npm install
npm run dev
```

Services :

| Service | URL |
|---|---|
| Frontend Vite | `http://localhost:5173` |
| Backend API | `http://localhost:4000` |

Scripts utiles :

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

## Stack

| Couche | Technologie |
|---|---|
| Frontend | React, Vite, Tailwind CSS, Recharts, React Router |
| Backend | Node.js, Express, TypeScript |
| Base de donnees | SQLite avec `better-sqlite3` |
| Donnees marche | Yahoo Finance via `yahoo-finance2` |
| Mobile | Capacitor Android |
| Deploiement | Docker / Docker Compose |
