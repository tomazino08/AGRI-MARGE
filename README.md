# AGRI-MARGE

**Le carnet de l'agriculteur qui parle : dis ce que tu dépenses et ce que tu récoltes, l'app calcule si tu gagnes ou si tu perds.**

Application mobile pour le Challenge Agri App 2026 (FUPRO-Bénin, salon SUNA).
Essayer : https://agri-marge.vercel.app

## Le problème

Beaucoup d'exploitations familiales ne notent pas leurs dépenses (labour, semis, engrais, main-d'œuvre, transport). À la récolte, on connaît ce qu'on a vendu, mais pas ce que la culture a vraiment coûté. On ne sait donc pas si on a gagné de l'argent, ni combien coûte un kilo produit.

## Notre solution

L'agriculteur **parle** au téléphone : « labour soixante-seize mille huit cents francs et semis quarante-trois mille deux cents francs ». L'app comprend la phrase, crée les lignes du carnet et calcule le bilan.

- **Bilan** = récolte − dépenses. Les pertes (inondation, vol, pourriture) sont comptées à part.
- **Coût au kilo** par culture, comparé au prix de vente.
- **Le prix est toujours donné par l'agriculteur.** L'app n'invente aucun prix.
- Unité locale : le **kanti**.

## Ce que l'app fait aujourd'hui

| Onglet | Rôle |
|---|---|
| Micro | Dicter une ou plusieurs dépenses, récoltes ou pertes dans la même phrase |
| Carnet | Voir les lignes, le bilan et le coût au kilo, effacer une ligne |
| Pluie | Chances de pluie du jour et des jours suivants (données Open-Meteo, sans conseil) |
| Vendre | Envoyer son bilan par WhatsApp |
| Taper | Saisir à la main si la voix ne marche pas |

## Ce que nous voulons faire ensuite

Nous visons : utilisation sans internet, sauvegarde du compte pour changer de téléphone, langues locales, SMS, prix du marché, conseils agricoles de sources officielles, et un tableau de bord pour les unions de producteurs (chiffres regroupés, avec l'accord de chaque membre). Rien de tout cela n'est fait aujourd'hui.

## Ce que l'app ne fait pas

- Elle ne diagnostique aucune maladie des plantes.
- Elle ne donne aucun conseil agronomique.
- Elle ne fournit aucun prix du marché.
- La fiabilité des chances de pluie n'a pas encore été mesurée sur le terrain.

## Accès et coût pour l'agriculteur

Un téléphone avec internet et un navigateur. Pas d'inscription : l'entrée est directe. L'app peut s'installer sur l'écran d'accueil.

## Confidentialité et sécurité

- Chaque utilisateur ne voit que son propre carnet (sécurité par utilisateur dans la base).
- La voix sert uniquement à créer les lignes du carnet.
- Les clés secrètes sont dans les variables d'environnement, jamais dans le code.
- Limite de 20 usages vocaux par utilisateur et par jour, pour éviter les abus.

## Moyens utilisés

GitHub, Vercel (hébergement), Supabase (base de données), Groq (voix en texte), Open-Meteo (météo). Ce sont des services à offre gratuite ; les limites exactes restent à vérifier pour le budget.

## Auteur

HOUNTONDJI Comlan Marths Bestinel Tomazino, étudiant en Mathématiques, Informatique et Applications, à la faculté des sciences et techniques de l'université d'Abomey-Calavi (Bénin).
