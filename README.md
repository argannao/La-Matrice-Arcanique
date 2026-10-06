# La Matrice Arcanique

Système de magie **générique et réaliste** pour JDR : chaque sort se construit à partir d'effets physiques (chaleur, mouvement, lumière, matière…), la physique réelle donne l'énergie en joules, puis des règles d'inspiration — réglables — la convertissent en coût jouable (l'**Éther**).

## Modules

| Page | Rôle |
|---|---|
| `index.html` | Accueil et menu |
| `forge.html` | Constructeur de sorts, calcul du coût en direct |
| `grimoire.html` | Sorts sauvegardés (navigateur), sorts d'exemple, import / export JSON |
| `lois.html` | Référence des règles : formules, facteurs, cercles, échelle des énergies |

## Structure

```
assets/
  matrice.js   moteur de calcul (composantes, facteurs, conversion en Éther, exemples)
  commun.js    barre de navigation, pied de page, notifications
  forge.js     logique de la Forge
  style.css    style commun
```

Ajouter une composante : une entrée dans `EFFETS` de `assets/matrice.js` (nom, école, nature, formule, paramètres, fonction `calcul`). La Forge et les Lois la prennent en compte automatiquement.

## Publication

Site 100 % statique, publiable sur GitHub Pages : *Settings → Pages → Deploy from a branch → `main` / root*.
