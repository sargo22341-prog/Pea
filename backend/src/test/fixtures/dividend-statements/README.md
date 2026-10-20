# Relevés de coupons de test

Texte extrait par `pdf-parse` (comme `pdf-text.child.ts`) de trois relevés mensuels réels, puis
**entièrement anonymisé** : banque, nom, adresse, numéro de compte, codes client et codes-barres
remplacés par des valeurs fictives (« Banque Fictive », `00000 00000 00000000000`). Les quantités
et montants ont été modifiés de façon cohérente (lignes, totaux et récapitulatifs toujours justes) ;
seuls les ISIN de sociétés cotées sont conservés.

- `foreign-multiple.txt` : mai, sept lignes dont deux valeurs étrangères (retenue) et un remboursement.
- `irregular-quantity.txt` : juin, quantités sur une ligne à part. Sur les relevés réels,
  `pdf-parse` a toujours écrit la quantité sur la ligne du coupon : cette mise en page, observée
  avec d'autres extracteurs, a été reconstituée à partir d'un relevé réel.
- `french-simple.txt` : avril, deux valeurs françaises.

Ne jamais ajouter de relevé réel, de texte extrait non anonymisé ni de capture dans le dépôt.
