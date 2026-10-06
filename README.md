# La Matrice Arcanique

Système de magie **générique et réaliste** pour JDR. Un sort est un **blueprint** : une suite de blocs exécutés dans l'ordre, parmi 27 blocs répartis en six familles (fondation, matière, énergie, mouvement, protection, contrôle) — rassembler ou condenser la matière, changer d'état (chaleur latente réelle), façonner, fragmenter, compresser (adiabatique), chauffer, embraser (combustion), charger électriquement, imprégner de mouvement, téléporter, viser, guider, dissimuler, poser un piège… La Matrice simule l'état du sort à chaque bloc — température, temps, matière — avec la vraie physique (pertes de chaleur comprises), signale les erreurs de conception (brûlure du lanceur, flamme qui se disperse…) et convertit l'énergie dépensée en coût jouable (l'**Éther**).

## Modules

| Page | Rôle |
|---|---|
| `index.html` | Accueil et menu |
| `forge.html` | Éditeur de blueprints : blocs réordonnables, état après chaque bloc, courbe de température, coût et dangers |
| `grimoire.html` | Sorts sauvegardés (navigateur), sorts d'exemple, import / export JSON |
| `lois.html` | Référence des règles : blueprints, blocs, physique des pertes, dangers, Éther et cercles |

## Structure

```
assets/
  matrice.js   données de base (matériaux, effets directs, réglages, formatage, stockage)
  blueprint.js blocs du blueprint, simulation, coût, blueprints d'exemple
  commun.js    barre de navigation, pied de page, notifications
  forge.js     logique de la Forge
  style.css    style commun
```

Ajouter un bloc : une entrée dans `BLOCS` de `assets/blueprint.js` (nom, école, nature, couleur, description, formule, paramètres, fonction `appliquer(etat, params, ctx)`). Ajouter un effet direct : une entrée dans `EFFETS` de `assets/matrice.js`. La Forge et les Lois les prennent en compte automatiquement.

## Publication

Site 100 % statique, publiable sur GitHub Pages : *Settings → Pages → Deploy from a branch → `main` / root*.
