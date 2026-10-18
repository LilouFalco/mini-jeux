# Application du fichier groupé, après feu vert de la revue uniquement

STATUT ACTUEL : NE PAS EXÉCUTER. Revue de sécurité indépendante en cours.
Cette procédure décrit l'étape future, elle n'affirme aucune installation.

Préparation

La migration 001 a déjà été exécutée dans le projet uzavqjibtadnawurwvih.
Ne pas la recoller. Aucun changement de clé, quota, Auth ou Realtime n'est demandé.
Le fichier groupé actuel est sql/002-online-puissance4.sql. Son nom historique ne
signifie pas qu'il ne contient que P4 : le brouillon contient les sept protocoles.
Le nom est gelé pendant la revue. S'il change ensuite, mettre à jour ce document
et fournir uniquement le nom final confirmé, sans deuxième migration 002.
Les fichiers sql/sources/*.sql ne sont PAS des fichiers à appliquer séparément.

Feu vert nécessaire avant de donner le fichier à Lilou

Terminer la revue indépendante et ses corrections, refaire les tests protégés,
puis figer le commit et SHA-256 exacts de l'unique fichier final. Relire
sql-seven-review.md pour les limites connues et corriger tout écart de couverture.
Les instructions destinées à Lilou doivent être données une action à la fois.
Ne jamais demander de service-role key, mot de passe de base ou jeton de session.

Première action à demander à Lilou, seulement après validation

Ouvrir directement cet éditeur SQL du bon projet
https://supabase.com/dashboard/project/uzavqjibtadnawurwvih/sql/new

Deuxième action, quand l'éditeur est ouvert

Copier TOUT le contenu de l'unique fichier SQL final validé qui sera fourni.
Le coller dans une nouvelle requête vide. Ne pas copier un extrait du chat,
les sources individuelles, ni les balises de bloc de code.
Le fichier doit contenir une seule transaction BEGIN ... COMMIT.
Vérifier que le projet affiché est bien celui indiqué ci-dessus.

Troisième action

Cliquer Run une seule fois et attendre la fin. En cas d'erreur, ne pas continuer
avec des morceaux du fichier et ne pas modifier les protections du projet.
Envoyer uniquement le texte de l'erreur ou une capture sans clé ni jeton.
La transaction annule les changements si une instruction échoue. Après une erreur,
utiliser une nouvelle requête et le fichier corrigé complet seulement sur instruction.
Les répétitions ont été vérifiées en local, mais ce n'est pas une raison pour
relancer inutilement une opération réelle. Une déconnexion de l'éditeur ne prouve
ni le succès ni l'échec : arrêter et faire vérifier avant une nouvelle exécution.

Quatrième action

Confirmer le succès dans le chat. Ne pas lancer de test d'inscription soi-même.
L'installation du schéma ne publie pas les interfaces. Le parent coordonne les
vrais tests avec exactement deux identités enregistrées en sécurité et réutilisées.
Aucun test réel ne doit démarrer simplement parce que l'heure prévue est arrivée.

Après application confirmée

Tester Morpion puis P4 sur deux clients réels, notamment WebKit, et mesurer la
notification privée Realtime sans prendre le polling pour une preuve instantanée.
Pour les autres jeux, brancher puis tester chaque interface avant sa publication.
Échecs : les deux clients doivent rejouer et valider les coups, bloquer visiblement
un historique illégal et conserver le dernier plateau validé. La validation complète
des coups n'est volontairement pas garantie par le serveur, mode entre amis.
Le schéma seul ne rend pas un jeu prêt ou disponible en ligne.
Publication uniquement après les preuves requises et décision du parent.

Limites connues à ne pas masquer

Undercover : quatre paires seulement, sans Mr White pour le moment.
Time's Up : paquet fixe de seize cartes, durée fixe, thèmes non configurables.
Petit Bac : six catégories fixes, pas encore de cumul des scores entre manches.
Qui est-ce : l'interface doit fixer la correspondance des 24 cases avec les champions.
Les interfaces et options complètes des jeux existants ne sont pas encore reproduites.
Les parties autres que Petit Bac n'ont pas encore de revanche dédiée.
Voir sql-seven-review.md pour la description technique et les tests exacts.
