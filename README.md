# La Matrice Arcanique

Système de magie **générique et réaliste** pour JDR. Un sort est un **blueprint** : une suite de blocs exécutés dans l'ordre, parmi une quarantaine de blocs répartis en sept familles (fondation, matière, énergie, mouvement, protection, vie & esprit, contrôle) — rassembler ou condenser la matière, changer d'état (chaleur latente réelle), façonner, fragmenter, compresser (adiabatique), chauffer, embraser, préparer un combustible gazeux, apporter l'oxygène, allumer et entretenir une vraie flamme (combustion chimique réelle : températures adiabatiques, couleur, hauteur de Heskestad, rayonnement), charger électriquement, imprégner de mouvement, téléporter, viser, guider, dissimuler, poser un piège… La Matrice simule l'état du sort à chaque bloc — température, temps, matière — avec la vraie physique (pertes de chaleur comprises), signale les erreurs de conception (brûlure du lanceur, flamme qui se disperse…) et convertit l'énergie dépensée en coût jouable (l'**Éther**).

## Modules

| Page | Rôle |
|---|---|
| `index.html` | Accueil et menu |
| `forge.html` | Éditeur de blueprints : blocs réordonnables, état après chaque bloc, courbe de température, coût et dangers |
| `grimoire.html` | Sorts sauvegardés (navigateur), sorts d'exemple, import / export JSON |
| `lois.html` | Référence des règles : blueprints, blocs, physique des pertes, dangers, Éther et cercles |
| `ecoles.html` | Les quinze écoles de magie : principes, forces, limites, blocs et sorts d'exemple |
| `guide.html` | Guide de l'apprenti : premier sort pas à pas, lecture de la Forge, erreurs classiques, conversion pour son JDR |

## Structure

```
assets/
  matrice.js   données de base (matériaux, effets directs, réglages, formatage, stockage)
  blueprint.js blocs du blueprint, simulation, coût, blueprints d'exemple
  ecoles.js    descriptions des écoles de magie
  choix.js     sélecteurs visuels des options de blocs
  commun.js    barre de navigation, pied de page, notifications
  compte.js    comptes (Google, GitHub, e-mail) et synchronisation du grimoire via Firebase
  firebase-config.js  configuration Firebase (null = site sans comptes)
  forge.js     logique de la Forge
  style.css    style commun
```

Ajouter un bloc : une entrée dans `BLOCS` de `assets/blueprint.js` (nom, école, nature, couleur, description, formule, paramètres, fonction `appliquer(etat, params, ctx)`). Ajouter un effet direct : une entrée dans `EFFETS` de `assets/matrice.js`. La Forge et les Lois les prennent en compte automatiquement.

## Publication

Site 100 % statique, publiable sur GitHub Pages : *Settings → Pages → Deploy from a branch → `main` / root*.

## Comptes (Firebase)

Sans configuration, le site fonctionne en local : les sorts restent dans le navigateur. Pour activer les comptes :

1. **Créer le projet** sur [console.firebase.google.com](https://console.firebase.google.com) → *Ajouter un projet* (Google Analytics facultatif).
2. **Ajouter une application Web** (icône `</>`), sans Firebase Hosting. Copier l'objet `firebaseConfig` affiché dans `assets/firebase-config.js` à la place de `null`.
3. **Authentication → Méthode de connexion**, activer :
   - *Google* ;
   - *Adresse e-mail/Mot de passe* ;
   - *GitHub* : créer d'abord une OAuth App sur GitHub (*Settings → Developer settings → OAuth Apps → New OAuth App*), avec comme *Homepage URL* `https://argannao.github.io/La-Matrice-Arcanique/` et comme *Authorization callback URL* l'URL indiquée par Firebase (`https://<projet>.firebaseapp.com/__/auth/handler`), puis reporter le *Client ID* et le *Client secret* dans Firebase.
4. **Authentication → Paramètres → Domaines autorisés** : ajouter `argannao.github.io`.
5. **Firestore Database → Créer une base de données** en mode production (région Europe, par ex. `europe-west9` Paris), puis onglet *Règles* : coller le contenu de `firestore.rules` et publier.

Les sorts sont stockés dans `users/{uid}/sorts/{id}` ; chaque utilisateur n'a accès qu'aux siens. Les sorts créés sans compte sont rattachés au compte à la première connexion.
