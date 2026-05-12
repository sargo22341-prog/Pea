# PEA Portfolio

**Suivi de portefeuille auto-hébergé pour les comptes PEA (Plan d'Épargne en Actions).**  
Suivez vos positions, dividendes et performances en temps réel — sans envoyer vos données à un service tiers.

[![Version](https://img.shields.io/badge/version-0.1.36-blue)](CHANGELOG.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Présentation

PEA Portfolio est une application web full-stack destinée aux investisseurs particuliers détenteurs d'un PEA. Elle agrège les données de marché depuis Yahoo Finance, stocke tout localement dans SQLite et propose une interface sombre soignée avec des graphiques, un calendrier de dividendes et des outils d'analyse de portefeuille.

**Principes fondamentaux :**
- **Auto-hébergé** — vos positions et données financières ne quittent jamais votre serveur.
- **Cache-first** — Yahoo Finance n'est appelé que pour rafraîchir les données ; l'interface lit toujours depuis SQLite.
- **Mono-utilisateur** — conçu pour un seul compte, sans complexité multi-tenant.
- **Mode privé** — masquez tous les chiffres personnels (valeurs, quantités, performances) d'un seul clic, en conservant uniquement les données de marché visibles.

---

## Fonctionnalités

### Portefeuille
- Valorisation du portefeuille en temps réel agrégée depuis Yahoo Finance
- Détail par position : quantité, prix moyen d'achat, valeur actuelle, frais payés, dividendes reçus
- Graphique de performance par intervalle (1 jour → tout) avec marqueurs de transactions
- Tri du dashboard par nom, valeur de marché ou performance sur la période
- Liste de surveillance affichée aux côtés des positions

### Dividendes
- Estimation annuelle des dividendes avec graphique mensuel en barres
- Vue regroupée par actif avec répartition trimestrielle (Q1–Q4)
- Rendement sur dividende et rendement sur coût d'achat par position
- Historique des dividendes par actif sur 5 ans

### Analyse
- Treemap du portefeuille (poids par actif)
- Graphiques de répartition par pays et par secteur
- Comparaison des marges nettes entre les positions
- Graphique combiné Revenue / Résultat net / Marge par entreprise

### Détail d'un actif
- Graphique d'historique des prix sur tous les intervalles
- Panneau d'informations de marché : fourchette 52 semaines, volume, dividende annuel, date ex-dividende
- Résumé de votre position : valeur, plus-value, performance sur la période
- Articles Yahoo Finance (optionnel, activable dans les paramètres)

### Import
- **CSV Boursorama** — prévisualisation avant import, lignes corrigeables, fusion ou remplacement des positions existantes
- **PDF avis opérés** — extraction automatique des opérations depuis les avis du courtier, prévisualisation éditable, transactions horodatées

### Paramètres
- Mode privé : remplace tous les chiffres personnels par `••••` sur toutes les pages
- Tri par défaut du dashboard et intervalle de graphique par défaut
- Recherche locale PEA pour limiter les appels API
- Activation des actualités Yahoo Finance et choix de la langue (FR / EN)
- Photo de profil
- Gestion des icônes d'actifs

---

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, Recharts, React Router 7 |
| Backend | Node.js, Express 5, TypeScript |
| Base de données | SQLite via `better-sqlite3` |
| Données de marché | `yahoo-finance2` (rate-limité, cache-first) |
| Authentification | Cookie de session (`httpOnly`), hachage bcryptjs |
| Validation | Zod |
| Déploiement | Build Docker multi-étapes, docker-compose |

---

## Prérequis

- **Node.js** ≥ 20
- **npm** ≥ 10
- ou **Docker** + **Docker Compose** pour un déploiement conteneurisé

---

## Démarrage rapide (développement)

```bash
# 1. Cloner le dépôt
git clone https://github.com/your-username/pea-portfolio.git
cd pea-portfolio

# 2. Copier le fichier d'environnement
cp .env.example .env

# 3. Installer les dépendances (monorepo)
npm install

# 4. Démarrer le backend et le frontend en parallèle
npm run dev
```

| Service | URL |
|---|---|
| Frontend (Vite) | http://localhost:5173 |
| Backend API | http://localhost:4000 |

Au premier lancement, l'application vous invite à créer un compte local (identifiant + mot de passe). Les connexions suivantes utilisent ce même compte.

### Services individuels

```bash
npm run dev:backend    # backend uniquement (port 4000, tsx watch)
npm run dev:frontend   # frontend uniquement (port 5173, Vite HMR)
```

### Scripts utiles

```bash
npm run build          # compile tous les workspaces (shared → backend → frontend)
npm run typecheck      # vérification des types sans émission de fichiers
npm run lint           # ESLint sur backend, frontend et shared
npm run test           # lance toutes les suites de tests
npm run cache:clear    # vide le cache des données de marché Yahoo Finance
npm run dev:clear      # vide le cache puis démarre les serveurs de développement
```

---

## Production (Docker)

```bash
docker compose up --build
```

L'application est accessible sur **http://localhost:4000**.  
La base de données SQLite et les icônes téléversées sont persistées dans le volume `./data`.

### Extrait docker-compose.yml

```yaml
services:
  pea:
    build: .
    ports:
      - "4000:4000"
    volumes:
      - ./data:/app/data
    environment:
      NODE_ENV: production
      PORT: 4000
      SQLITE_PATH: /app/data/pea.sqlite
```

---

## Variables d'environnement

Copiez `.env.example` vers `.env` et ajustez selon vos besoins.

| Variable | Valeur par défaut | Description |
|---|---|---|
| `PORT` | `4000` | Port du serveur Express |
| `SQLITE_PATH` | `./data/pea.sqlite` | Chemin vers le fichier de base de données SQLite |
| `TZ` | `Europe/Paris` | Fuseau horaire utilisé pour les calculs de séance de marché |
| `FRONTEND_DIST` | `../frontend/dist` | Chemin vers le build frontend (production) |
| `PUBLIC_URL` | *(vide)* | Origine publique autorisée en production, par exemple `https://pea.nas.meme`. Si vide, l'origine du `Host` courant est acceptée pour l'usage Docker local. |
| `TRUST_PROXY` | `false` | Active la confiance dans les headers `X-Forwarded-*` uniquement quand Express est derrière un reverse proxy fiable. |
| `VITE_API_BASE_URL` | `http://localhost:4000` | URL de base de l'API utilisée par le proxy Vite |
| `WAIT_FOR_HEALTH_TIMEOUT_MS` | `30000` | Timeout du script de vérification de santé en développement |
| `LOGO_DEV_API_KEY` | *(optionnel)* | Clé API pour la récupération automatique des logos d'actifs |
| `DEBUG` | `false` | Active les logs détaillés du backend |
| `DEBUG_DATE` | *(optionnel)* | Remplace la date courante pour les tests (chaîne ISO) |

---

## CI / CD (Gitea)

Le workflow `.gitea/workflows/docker-release.yml` s'exécute à chaque push et sur déclenchement manuel :

1. Installation des dépendances (`npm ci`)
2. Exécution de `typecheck` et `build`
3. Construction de l'image Docker depuis `backend/Dockerfile`
4. Sur déclenchement manuel : montée de version (`patch` / `minor` / `major`), commit et création d'un tag `vX.Y.Z`
5. Publication de l'image si `publish=true` ou si le workflow s'exécute sur un tag `v*`

**Secrets Gitea requis :**

| Secret | Description |
|---|---|
| `DOCKER_REGISTRY` | Hôte du registre sans protocole (ex. `registry.example.com/mon-org`) |
| `DOCKER_USERNAME` | Identifiant du registre |
| `DOCKER_PASSWORD` | Mot de passe ou token du registre |

---

## Référence API

### Authentification
| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/setup` | Création du premier compte |
| `POST` | `/api/auth/login` | Authentification |
| `POST` | `/api/auth/logout` | Invalidation de la session |
| `GET` | `/api/auth/me` | Récupération de l'utilisateur courant et de ses préférences |
| `PATCH` | `/api/auth/me` | Mise à jour des préférences (tri, intervalle, mode privé…) |
| `POST` | `/api/auth/me/profile-icon` | Téléversement de la photo de profil |
| `DELETE` | `/api/auth/me/profile-icon` | Suppression de la photo de profil |

### Portefeuille
| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/portfolio` | Synthèse du portefeuille (valeur totale, positions) |
| `GET` | `/api/portfolio/chart?range=` | Données du graphique de valorisation |
| `GET` | `/api/portfolio/performance?range=` | Performance par position sur l'intervalle |
| `GET` | `/api/portfolio/dividends` | Dividendes regroupés par actif + estimations mensuelles |
| `GET` | `/api/portfolio/analysis` | Répartition pays/secteur, treemap, données financières |
| `POST` | `/api/portfolio/positions` | Ajout d'une position |
| `PUT` | `/api/portfolio/positions/:id` | Modification d'une position |
| `DELETE` | `/api/portfolio/positions/:id` | Suppression d'une position |

### Données de marché
| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/assets/:symbol` | Détail d'un actif (cotation, graphique, dividendes, position) |
| `GET` | `/api/assets/:symbol/icon` | Logo de l'actif |
| `POST` | `/api/assets/:symbol/icon` | Téléversement d'un logo personnalisé |
| `DELETE` | `/api/assets/:symbol/icon` | Réinitialisation du logo |
| `GET` | `/api/search?q=` | Recherche d'actifs (Yahoo ou liste locale PEA) |
| `GET` | `/api/market/top-movers` | Meilleures hausses et plus fortes baisses du jour |

### Import
| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/api/import/boursorama/preview` | Prévisualisation de l'import CSV Boursorama |
| `POST` | `/api/import/boursorama/confirm` | Confirmation de l'import CSV |
| `POST` | `/api/import/avis-operes/preview` | Prévisualisation des avis opérés PDF |
| `POST` | `/api/import/avis-operes/confirm` | Confirmation de l'import PDF |

---

## Données de marché

Le backend applique une stratégie **cache-first** :

- Toutes les requêtes du frontend passent par le backend local uniquement — aucun appel direct à Yahoo Finance depuis le navigateur.
- Le backend lit SQLite en priorité ; Yahoo Finance n'est appelé que pour rafraîchir les données périmées ou manquantes.
- Cotations, historiques de prix, dividendes et données fondamentales sont tous mis en cache dans SQLite.
- La vue intraday `1d` utilise `yahooFinance.chart` avec un intervalle de `2m`, bornée à la séance Euronext Paris courante ou précédente.
- Les appels Yahoo Finance sont limités via Bottleneck (`maxConcurrent=1`, `minTime=250ms`) avec des tentatives en backoff exponentiel.
- En cas d'erreur `429`, `401`, d'erreur de crumb ou de `Too Many Requests`, le backend renvoie les dernières données en cache et marque les réponses comme `stale`.
- Les données périmées sont signalées visuellement dans l'interface par « Données différées ».
- La couche de données de marché est abstraite derrière `MarketDataProvider`, ce qui facilite le remplacement de Yahoo Finance par un autre fournisseur (EODHD, Twelve Data, Alpha Vantage…).

### Limites de Yahoo Finance

Yahoo Finance ne garantit pas une couverture exhaustive des dividendes ni les calendriers futurs pour tous les titres. L'application utilise les dividendes réels quand ils sont disponibles et estime les prochains versements à partir des données de l'année précédente en l'absence de données futures fiables.

L'éligibilité PEA affichée dans les résultats de recherche est calculée localement à partir du symbole, de la bourse et de l'ISIN — elle n'est pas vérifiée par Yahoo Finance et est affichée avec un niveau de confiance associé.

---

## Structure du projet

```
pea-portfolio/
├── backend/              # API Express + SQLite
│   ├── src/
│   │   ├── routes/       # Gestionnaires de routes API
│   │   ├── services/     # Logique métier (auth, portefeuille, yahoo…)
│   │   ├── middleware/   # Authentification, rate limiting, CORS
│   │   ├── db.ts         # Adaptateur SQLite
│   │   ├── db-migrations.ts
│   │   └── server.ts
│   └── Dockerfile
├── frontend/             # SPA React + Vite
│   └── src/
│       ├── components/   # Composants UI réutilisables et métier
│       ├── contexts/     # Contextes React (PrivacyContext…)
│       ├── hooks/        # Hooks personnalisés
│       ├── lib/          # Client API, formatage, utilitaires de confidentialité
│       ├── pages/        # Composants de page (niveau route)
│       └── utils/        # Tonalité des actifs, utilitaires divers
├── shared/               # Types TypeScript partagés (DTOs)
├── scripts/              # Scripts d'aide au développement
├── data/                 # Base SQLite + icônes de profil (ignoré par git)
├── docker-compose.yml
└── .env.example
```

---

## Contribuer

Les contributions sont les bienvenues. Avant d'ouvrir une pull request :

1. Forkez le dépôt et créez une branche depuis `main`.
2. Exécutez `npm run typecheck` et `npm run lint` — les deux doivent passer sans erreur.
3. Si votre contribution touche le schéma de base de données, ajoutez une migration dans `backend/src/db-migrations.ts`.
4. Écrivez ou mettez à jour les tests concernés (`npm run test`).
5. Gardez les commits ciblés et rédigez des messages de commit clairs.

---

## Licence

MIT — voir [LICENSE](LICENSE) pour les détails.
