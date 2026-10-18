# Yakazu de Lilou

Jeu statique en français, sans compte et sans dépendance JavaScript.

Les grilles sont produites dans un Web Worker. Le moteur crée un motif de cases noires, trouve une solution par recherche avec contraintes, puis retire des indices seulement si un dénombrement confirme exactement une solution. Un plafond de recherche conserve les indices plutôt que de risquer une ambiguïté. Chaque case appartient à au moins un segment de deux cases ; les segments isolés ne contraignent pas leur direction. Les quatre niveaux changent la taille et la cible de retrait des indices, pas une classification par techniques humaines.

La partie est conservée dans le stockage local du navigateur. Le chronomètre se met en pause lorsque la page n’est pas visible. Les erreurs sont comparées à l’unique solution ; un indice signale d’abord une erreur, sinon révèle une case.

Lancer en local avec `python3 -m http.server 28461`.

Tests moteur avec `node test.cjs`. Tests navigateur avec `node ui-test.cjs` (Playwright et Chrome requis ; chemins de lancement à adapter). Les tests comprennent l’exemple officiel de yakazu-gratuit.fr, le cas des segments isolés, 40 générations vérifiées uniques et les interactions aux largeurs 1440, 390 et 360.

Publication GitHub Pages depuis main, racine.

## Installation et hors connexion

Le manifeste propose un affichage autonome et des icônes PNG roses 192/512. Sur un navigateur compatible, utiliser « Installer l’application » ou « Ajouter à l’écran d’accueil ». Après le premier chargement, attendre la mention « prêt hors connexion ». Le service worker précache tout le jeu, le générateur et les polices locales. Les nouvelles grilles sont créées sur l’appareil sans réseau. Comme toute application web, le mode hors connexion dépend de la conservation des données du site par le navigateur.

Tester le mode avion avec `node offline-test.cjs` : Playwright coupe le réseau, recharge la page, vérifie les ressources et les polices, génère aux quatre niveaux et vérifie la sauvegarde après rechargement, sur ordinateur et mobile. Le cache du service worker doit changer de version lors des futures mises à jour d’assets.

## Échecs

Ouvrir `chess.html?mode=solo` ou `chess.html?mode=duo`.
Les règles sont fournies par chess.js 1.4.0, version locale sous BSD-2-Clause
(`vendor/chess-LICENSE.txt`, provenance dans `vendor/README-chess.txt`). Aucun CDN.
L'IA locale est exécutée dans un worker module et ne bloque pas le plateau.
Facile est aléatoire, moyen cherche deux demi-coups et difficile jusqu'à quatre,
avec un budget de temps. Ce n'est pas un moteur de compétition.

L'application n'utilise pas `isGameOver()` de chess.js, car cette méthode
termine immédiatement sur les nulles réclamables. Le bouton des réglages
permet de réclamer trois répétitions ou 50 coups, sur la position actuelle
ou en annonçant un coup légal. Cinq répétitions et 75 coups sont automatiques,
avec priorité à l'échec et mat. L'ordi réclame une nulle disponible.
Le matériel insuffisant est détecté par chess.js (rois seuls, roi + fou ou
cavalier contre roi, et fous sur cases de même couleur). Ce n'est pas une
analyse exhaustive de toutes les positions mortes bloquées possibles.

La sauvegarde contient la position initiale et les coups légaux, pour conserver
les droits de roque, la prise en passant et le compte des répétitions.
Une sauvegarde invalide est ignorée. Réinitialiser ou annuler termine le worker
et invalide ses réponses précédentes. En cas de worker indisponible, un coup
légal de secours est joué et signalé, sans prétendre conserver le niveau choisi.

Tests locaux (serveur du dépôt sur `http://localhost:28461/` par défaut).

```sh
node chess-test.mjs
node chess-ui-test.cjs
node chess-offline-test.cjs
node chess-failure-test.cjs
node chess-worker-test.cjs
node mobile-nav-test.cjs
```

Les tests Playwright utilisent Chromium et WebKit installés dans le sandbox.
Les tests hors ligne démarrent depuis l'accueil en ligne, attendent le
précache v25, puis coupent le réseau avant d'ouvrir et jouer aux échecs.
