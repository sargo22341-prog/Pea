# Relevés espèces de test

Texte extrait par `pdf-parse` (comme `pdf-text.child.ts`) de relevés espèces mensuels réels, puis
**entièrement anonymisé** : banque, titulaire, adresse, IBAN, BIC, numéros de compte, de client,
de feuillet et références remplacés par des valeurs fictives (« Banque Fictive », « FICTIVE
CAMILLE », `00000 00000 00000000000`) ; le virement « VIR Virement de … » porte un nom fictif. Les
montants et quantités ont été modifiés et les soldes recalculés pour rester cohérents (ancien solde
+ opérations = nouveau solde, nouveau solde d'un mois = ancien solde du suivant). Seuls les noms
abrégés de sociétés cotées sont conservés.

- `legacy-opening.txt` : ancien format, juillet 2021, ouverture du compte (ancien solde nul,
  virement de création, trois achats le même jour).
- `legacy-second-month.txt` : ancien format, août 2021, suite de `legacy-opening.txt` : coupon et
  virement « Virement de <Nom> » (reconstitué, nom fictif) ; sert au passage en historique complet.
- `legacy-mixed.txt` : ancien format, décembre 2025 : virements (dont « Virement de <Nom> »),
  montant à milliers ambigu (« … EO 2 583,38 »), coupons (dont « VEOLIA ENVIRON. », qui contient
  « VIR »), remboursement de titres (quantité « -98 »), indemnisation et vente. La ligne de vente
  est reconstituée : aucun relevé réel disponible ne contient de vente.
- `legacy-year-end.txt` : ancien format, janvier 2026 : coupon échu en décembre de l'année
  précédente, nouveau solde repris en février par le changement de compte.
- `current-account-change.txt` : nouveau format, février 2026 : reprise du solde de l'ancien
  compte (ancien solde nul), virement suivi du nom du donneur d'ordre, achat comptant et achat
  étranger, coupon ; caractère parasite avant le nouveau solde.
- `current-mixed.txt` : nouveau format, mars 2026 : plusieurs lignes le même jour (coupons et
  remboursement), indemnisation de quantité nulle, vente (reconstituée), achat étranger à
  milliers.

Ne jamais ajouter de relevé réel, de texte extrait non anonymisé ni de capture dans le dépôt.
