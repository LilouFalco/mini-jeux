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
