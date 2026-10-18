# Appliquer la migration 002 (Puissance 4 en ligne)

NE PAS appliquer avant l'accord du parent. 001 doit déjà être appliquée (c'est le cas). Une seule action à la fois.

1. Ouvre https://supabase.com/dashboard/project/uzavqjibtadnawurwvih/sql/new
2. Ouvre le fichier sql/002-online-puissance4.sql (lien raw GitHub à fournir après publication), copie TOUT le contenu.
3. Colle dans l'éditeur SQL, un seul bloc.
4. Clique Run. Résultat attendu: Success, no rows returned. Si l'erreur RUN_001_FIRST apparaît, 001 manque.
5. Dis simplement "fait" ou copie le message d'erreur.

Revue locale: 230 lignes, transaction unique (begin/commit), garde RUN_001_FIRST, modifie la contrainte rooms_board_shape et remplace les fonctions online_*; ne touche ni clés, ni Auth, ni Realtime, ni 001. Route de migration autorisée non établie: éditeur SQL du dashboard par Lilou (propriétaire du projet); aucun accès admin supposé.
