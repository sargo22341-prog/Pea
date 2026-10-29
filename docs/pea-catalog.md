# Catalogue PEA local

Les références sont `backend/src/data/boursedirect_pea_action.json` et
`backend/src/data/boursedirect_pea_etf.json`. L’ancien catalogue est supprimé.
La recherche locale (option du compte), la confirmation d’éligibilité et les logos
utilisent le même catalogue normalisé. La recherche accepte nom, ticker, symbole Yahoo et ISIN.

Pour actualiser tous les 3-4 mois : relancer le script externe
`./recuperer_boursedirect_pea_complet.ps1 -Recommencer`,
remplacer les deux JSON, lancer les validations du README, puis reconstruire et
redéployer l’application. Aucun changement de code ou migration SQLite nécessaire.
Le catalogue est embarqué au build et chargé au démarrage ; les positions personnelles
et les icônes déjà enregistrées sont conservées.

Le format attendu est `{ "count": N, "instruments": [...] }` : compteur exact,
nom, ticker, marché (`mic`, `name` nullable), devise (`code`), ISIN optionnel, logo optionnel.
Un format invalide bloque le chargement avec une erreur de validation.
Les espaces autour des noms sont supprimés. Les lignes sans ISIN, les tickers
incompatibles et les places sans correspondance explicite sont écartés.
Les suffixes Yahoo sont définis dans `backend/src/services/assets/pea-catalog/catalog.ts` ;
une nouvelle place nécessite de vérifier cette correspondance. Elle ne doit jamais
être déduite du pays ou du ticker seul. La présence ne garantit pas une cotation
Yahoo disponible. Les autres règles existantes peuvent encore indiquer une éligibilité probable.

Les tickers de Francfort fournis par Bourse Direct portent un préfixe `F` :
`F2GB` devient `2GB.F` (voir la [cotation Yahoo de 2G Energy](https://de.finance.yahoo.com/quote/2GB.F/financials/)).
Ce préfixe est retiré uniquement pour le MIC `XFRA`, jamais sur les autres places.
Le générateur pourrait fournir à terme un champ de symbole Yahoo vérifié pour
lever les ambiguïtés et améliorer la couverture des places actuellement ignorées.

Les logos Bourse Direct servent après logo.dev et les favicons, même si Yahoo est
indisponible. Ils peuvent être partagés entre cotations du même ISIN. Seules les URL
HTTPS du répertoire des logos de www.boursedirect.fr sont acceptées, sans redirection.
Les limites de taille, délai et validation binaire restent appliquées. Les icônes
manuelles ou déjà en cache restent prioritaires ; la réinitialisation permet une nouvelle tentative.
Un ETF sans logo local conserve son comportement d’icône générique.

## État des fichiers fournis

5 133 lignes actions, 548 lignes ETF ; les compteurs correspondent aux tableaux.
Le catalogue normalisé retient 3 481 symboles distincts. Onze noms de marché
sont nuls dans les actions : le code MIC sert alors de libellé.
Ces symboles couvrent 2 288 des 3 436 ISIN renseignés distincts. Les 1 148 autres
ISIN n’ont pas de cotation sur une place prise en charge dans ces fichiers :
leur résolution Yahoo doit être enrichie à la source avant de les proposer localement.
329 lignes actions et 6 lignes ETF n’ont pas d’ISIN. Le fichier actions contient
1 442 logos et celui des ETF aucun. Plusieurs lignes représentent le même ISIN
sur différentes places ; ce ne sont pas autant de titres distincts.
Des places OTC, américaines et London MTF sont présentes ; elles ne sont pas
converties automatiquement en symboles Yahoo. Le script demande `pea=true`, mais
son avertissement précise que le compteur ne certifie pas l’éligibilité fiscale.
Pour améliorer la source : examiner les ISIN manquants et la collecte des logos ETF,
et contrôler le filtrage du fournisseur avant de considérer ces listes comme une
certification fiscale. Le script externe n’a pas été modifié.
