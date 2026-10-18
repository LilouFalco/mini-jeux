Morpion en ligne, installation v1

Ce fichier accompagne sql/001-online.sql. Le fichier SQL est un seul bloc transactionnel à coller et exécuter en entier. Il ne configure pas Auth et ne contient aucune clé secrète. Les autres jeux restent hors ligne pour cette première étape.

Dans le projet Supabase mini-jeux, ouvrir Authentication puis Sign In / Providers (la page /auth/providers). Ouvrir Anonymous Sign-Ins, activer Enable Anonymous Sign-Ins puis Save. Selon la version du tableau de bord, la rubrique est appelée Providers. Le guide officiel lie directement cette page, mais ne garantit pas la typographie exacte de chaque libellé. Ce réglage n'est pas activable par la migration SQL.

Ouvrir SQL Editor, New query. Copier tout le contenu de sql/001-online.sql, depuis begin jusqu'à commit inclus, puis Run. Vérifier que l'exécution réussit sans erreur. Si elle échoue, transmettre le message sans mot de passe ni clé secrète. Ne pas désactiver RLS pour contourner une erreur. Le script est réexécutable sur la même version, sans vider les parties. Il est conçu pour un nouveau projet; il ne remplace pas des politiques larges créées auparavant.

Ouvrir Realtime puis Settings (/realtime/settings), désactiver Allow public access et enregistrer. Les notifications de partie utilisent des canaux privés. La migration ajoute uniquement une politique de lecture Broadcast réservée aux membres; elle ne donne pas aux clients le droit de publier les coups. Le tableau realtime.messages est déjà protégé par RLS. Ne pas publier app_private dans les schémas exposés de la Data API, ni dans la publication Postgres Changes.

Pour vérifier, deux navigateurs ou appareils distincts doivent choisir Morpion puis En ligne, choisir un pseudo, créer ou rejoindre le même salon public, cliquer Prête puis laisser la personne hôte démarrer. Recharger conserve le compte invité et propose de reprendre le salon. Effacer les données du site ou changer de navigateur fait perdre cette identité invitée. Un pseudo identique ne récupère jamais une place.

Les chambres sont publiques et listées. Le nom n'est pas un mot de passe. Les données sont conservées tant que le projet ne les supprime pas; l'expiration de 30 minutes sans activité rend le salon inaccessible mais n'efface pas les lignes. Prévoir une maintenance séparée des salons expirés, reçus et utilisateurs anonymes. Le prototype limite par utilisateur les salons et actions, mais ne résiste pas seul à la création massive d'identités. Avant une large diffusion, ajouter CAPTCHA/Turnstile (nécessite sa clé publique côté client) et vérifier les limites Auth. Ne pas activer CAPTCHA sans adapter le client, sinon les connexions invitées échoueront.

Cette version n'implémente pas encore de compte email, migration automatique d'hôte après déconnexion, forfait pour absence chronométrée ni les sept autres jeux en ligne. La sortie explicite d'une partie en cours vaut abandon; une simple coupure réseau ne quitte pas. La récupération se fait sur le même navigateur grâce à la session Auth. Les notifications ne contiennent que version et instance; une lecture RPC autorisée reste la source de vérité.

Aucun accès administrateur au projet n'est établi par la clé publishable. L'exécution locale et les tests simulés ne prouvent pas que la migration a été appliquée ni qu'Auth est activé dans le projet réel. Ne pas annoncer le backend opérationnel avant vérification réelle à deux clients après installation.

Sources consultées le 18 octobre 2026

https://supabase.com/docs/guides/auth/auth-anonymous
https://supabase.com/docs/guides/realtime/authorization
https://supabase.com/docs/guides/realtime/broadcast
https://supabase.com/docs/reference/javascript/introduction

Le SDK officiel supabase-js 2.118.0 est fourni localement dans vendor/supabase-2.118.0.js, issu de l'archive npm publiée, licence MIT jointe. SHA-256 ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3. Sa version a été vérifiée dans le registre npm le 18 octobre 2026. Il n'est exécuté qu'après sélection du mode En ligne; le cache de l'application ne stocke que les fichiers statiques publics, jamais les appels Supabase. Le bouton Hors ligne conserve une place existante; Quitter le salon l'abandonne explicitement.

Les compteurs SQL limitent les opérations acceptées par transaction, pas les tentatives rejetées: PostgreSQL annule aussi l'incrément quand une exception rejette la requête. Ils ne remplacent donc pas une limitation anti-abus par IP ni les limites Auth. Une requête rejetée n'est pas enregistrée. Les limites Auth ne couvrent pas les RPC; limiter les tentatives RPC rejetées nécessite une passerelle de limitation dédiée, non déployée dans cette version. L'identité de création est séparée de l'hôte courant pour ne pas réattribuer une clé de création après transfert. Heartbeat et mutations prennent tous deux le verrou du salon avant celui du membre.
