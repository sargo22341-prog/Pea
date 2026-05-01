# Donnees de marche persistantes

Ce dossier remplace le cache TTL marche par des tables source de verite backend.

- `data/config.json` pilote les intervals configurables des ranges stockees `1d`, `1w`, `1m`. En prod Docker, ce fichier vit dans le volume `/app/data` pour rester modifiable.
- `assets` et `asset_profiles` stockent les metadonnees stables issues de `quote()` et `quoteSummary()`. Les champs absents chez Yahoo restent `NULL`.
- `chart_candles` stocke les candles OHLCV pre-calculées par range/interval avec `UNIQUE(asset_id, range, interval, datetime_start)`.
- `asset_market_snapshots` contient une seule ligne par asset: le dernier etat connu du marche. Quand le marche est ferme, les lectures utilisent cette table et n'appellent pas Yahoo, sauf action manuelle.
- `asset_financials` est alimente par `fundamentalsTimeSeries` quand disponible. `net_margin` est calcule uniquement si `total_revenue` et `net_income` existent.
- `asset_dividends` est alimente par `chart(..., events: 'div|split')`. Yahoo ne fournit pas `payment_date` ou `record_date`, donc ces champs ne sont pas crees.

## Logique intraday

`1d` est live si le marche est ouvert: le backend appelle Yahoo `chart()` avec l'interval configure et renvoie aussi `baselinePrice`. La baseline utilise la derniere cloture precedente, avec fallback sur `asset_market_snapshots.previous_close` puis sur les dernieres candles disponibles. La performance intraday est calculee par le backend avec `((price - baseline_price) / baseline_price) * 100`.

## Ranges stockees

`1w`, `1m` et `all` sont stockes dans `chart_candles`. `ytd`, `1y`, `5y` et `10y` sont calcules depuis `all` au moment de la lecture, sans stockage dedie. Les candles sont construites a l'ajout d'un asset, apres fermeture de marche et via les actions manuelles. Les buckets intraday sont alignes sur l'ouverture du marche et filtrent week-ends, jours feries et early closes depuis `market-holidays.json`.

## Portfolio et Dashboard

Les charts portefeuille ne sont pas stockes. `PortfolioService` reconstruit dynamiquement la valeur a chaque date depuis `chart_candles` et les transactions utilisateur. Les achats et ventes n'impactent la valeur qu'a partir de leur date reelle. Les blocs de performance du Dashboard consomment le meme DTO `/portfolio/chart`.

## Actions rapides

Les routes admin suivantes sont exposees:

- `GET /admin/market-data/construction`
- `POST /admin/market-data/rebuild` avec `{ "range": "1d" | "1w" | "1m" | "all" | "all_ranges" }`
- `POST /admin/market-data/rebuild-all` garde une compatibilite et reconstruit `all_ranges`
- `POST /admin/market-data/refresh-snapshots`
- `POST /admin/market-data/refresh-financials`
- `POST /admin/market-data/refresh-dividends`

La reconstruction par range supprime uniquement les candles, finalisations et caches chart de la range demandee, sans supprimer utilisateurs, transactions, positions, watchlist, preferences ou donnees annexes.

## Construction en arriere-plan

Les routes de lecture ne reconstruisent pas massivement les donnees. Si une chart manque de candles, le backend renvoie les points disponibles avec `isPreparing`, `missingRanges`, `missingAssets` et `jobId`, puis planifie une sous-tache en queue.

La queue limite Yahoo a une tache active et deduplique globalement par type/asset/range pour les candles. Une reconstruction `all_ranges` cree 4 sous-taches de candles par asset (`1d`, `1w`, `1m`, `all`); les snapshots, financials et dividends restent des actions annexes separees. La finalisation post-cloture expose les sous-taches `finalisation 1d`, `mise a jour 1w`, `mise a jour 1m` et `mise a jour all`. Le statut expose `totalTasks`, `completedTasks`, `failedTasks`, `pendingTasks`, `progressPercent` et `currentTaskLabel`.

## Limites yahoo-finance2

Le backend ne persiste que les champs retournes par `quote`, `quoteSummary`, `chart` et `fundamentalsTimeSeries`. Les donnees absentes restent nullables et n'arretent pas l'import.
