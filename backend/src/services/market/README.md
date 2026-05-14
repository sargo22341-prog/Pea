# Donnees de marche persistantes

Ce dossier remplace le cache TTL marche par des tables source de verite backend.

## Organisation

- `calendars/` decrit les horaires, sessions et fenetres de marche.
- `charts/` contient la configuration des ranges, le refresh lazy et les helpers de construction DTO.
- `construction/` gere la queue de reconstruction et le nettoyage des donnees marche.
- `data/` orchestre l'initialisation et la lecture des donnees marche persistantes.
- `dividends/` persiste les dividendes.
- `events/` emet les invalidations/SSE marche.
- `financials/` persiste les fondamentaux.
- `snapshots/` gere l'etat courant par asset.

- `data/config.json` pilote les intervalles configurables des ranges stockees `1d`, `1w`, `1m`. En prod Docker, ce fichier vit dans le volume `/app/data` pour rester modifiable.
- `assets` et `asset_profiles` stockent les metadonnees stables issues de `quote()` et `quoteSummary()`. Les champs absents chez Yahoo restent `NULL`.
- `chart_candles` stocke les candles OHLCV pre-calculees avec `range_key` (`1d`, `1w`, `1m`, `all`) et `UNIQUE(asset_id, range_key, interval, datetime_start)`.
- `asset_quote_snapshot`, `asset_quote_range` et `asset_dividend_snapshot` stockent respectivement les champs volatils de cotation, les donnees 52 semaines/volumes et les champs dividendes lents. La vue de compatibilite `asset_market_snapshots` reste disponible en lecture.
- `asset_financials` est alimente par `fundamentalsTimeSeries` quand disponible. `net_margin` est calcule uniquement si `total_revenue` et `net_income` existent.
- `asset_dividends` est alimente par `chart(..., events: 'div|split')`. Yahoo ne fournit pas `payment_date` ou `record_date`, donc ces champs ne sont pas crees.

## Logique intraday

`1d` est live si `quote.marketState === "REGULAR"`: le backend appelle Yahoo `chart()` avec l'interval configure et renvoie aussi `baselinePrice`. Si l'intraday Yahoo revient vide alors que le marche est ferme, le backend demande a Yahoo les candles daily recentes, retrouve la derniere seance disponible et sert les candles persistantes de cette seance, avec fallback sur la cloture daily Yahoo. La baseline utilise la derniere cloture precedente, avec fallback sur `asset_quote_snapshot.previous_close` puis sur les dernieres candles disponibles.

## Ranges stockees

`1d`, `1w`, `1m` et `all` sont stockes dans `chart_candles` via `range_key`. `ytd`, `1y`, `5y` et `10y` sont calcules depuis les candles `all` au moment de la lecture, sans stockage dedie. Les candles sont construites a l'ajout d'un asset, apres fermeture de marche et via les actions manuelles. Les buckets intraday sont alignes sur l'ouverture du marche; aucun calendrier de jours feries manuel n'est maintenu.

## Portfolio et Dashboard

Les charts portefeuille sont derives depuis `chart_candles`, les snapshots marche et les transactions utilisateur, puis mis en cache dans les caches derives quand le live refresh est actif. Les achats et ventes n'impactent la valeur qu'a partir de leur date reelle. Les blocs de performance du Dashboard consomment le meme DTO `/portfolio/chart` ou les DTO de performance par position.

## Actions rapides

Les routes admin suivantes sont exposees:

- `GET /admin/market-data/construction`
- `POST /admin/market-data/rebuild` avec `{ "range": "1d" | "1w" | "1m" | "all" | "all_ranges" }`
- `POST /admin/market-data/rebuild-all` garde une compatibilite et reconstruit `all_ranges`
- `POST /admin/market-data/refresh-annex`
- `GET /admin/runtime-health`

La reconstruction par range supprime uniquement les candles, finalisations et caches chart de la range demandee, sans supprimer utilisateurs, transactions, positions, watchlist, preferences ou donnees annexes.

## Construction en arriere-plan

Les routes de lecture ne reconstruisent pas massivement les donnees. Si une chart manque de candles, le backend renvoie les points disponibles avec `isPreparing`, `missingRanges`, `missingAssets` et `jobId`, puis planifie une sous-tache en queue.

La queue execute plusieurs workers tout en evitant deux taches simultanees sur le meme symbole. Les appels Yahoo restent rate-limites par la facade Yahoo. Une reconstruction `all_ranges` cree 4 sous-taches de candles par asset (`1d`, `1w`, `1m`, `all`); les snapshots, financials, dividends et calendar events restent des actions annexes separees. La finalisation post-cloture expose les sous-taches `finalisation 1d`, `mise a jour 1w`, `mise a jour 1m` et `mise a jour all`. Le statut expose `totalTasks`, `completedTasks`, `failedTasks`, `pendingTasks`, `progressPercent` et `currentTaskLabel`, et `/admin/runtime-health` expose l'etat scheduler/cache/queue/Yahoo.

## Limites yahoo-finance2

Le backend ne persiste que les champs retournes par `quote`, `quoteSummary`, `chart` et `fundamentalsTimeSeries`. Les donnees absentes restent nullables et n'arretent pas l'import.
