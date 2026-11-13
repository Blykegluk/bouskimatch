# Bouskimatch

Petit jeu de foot rigolo pour enfants (6-12 ans), jouable dans le navigateur sur téléphone et ordinateur.

## Où on en est

Étape 2 sur 5 : vrai match 3 contre 3 de 2 minutes, avec menu, choix du personnage, trois difficultés,
coéquipiers et adversaires gérés par le jeu, passes, quatre aptitudes et écran de fin.

Étapes suivantes : jeu à deux en ligne avec un code de partie, personnages et rendu soignés, mise en ligne finale.

## Commandes

- Téléphone : joystick à gauche, bouton ballon pour tirer, bouton nuage pour le tacle, bouton éclair pour l'aptitude.
- Ordinateur : flèches ou ZQSD pour bouger, Espace pour tirer, Maj pour le tacle, E pour l'aptitude.
- Appui bref sur le tir = passe au coéquipier, appui maintenu = tir puissant.

## Les aptitudes

Une jauge se remplit en jouant, et des bonus dorés apparaissent sur le terrain. Quand elle est pleine,
le bouton éclair déclenche l'aptitude qui convient à la situation :

| Situation | Aptitude |
|---|---|
| Tu as le ballon | 💣 Boulet de canon : tir enflammé qui renverse tout sur son passage |
| Un adversaire avec le ballon est tout près | 🥾 Super tacle : longue glissade qui l'envoie valser |
| L'adversaire attaque ton but | 🧤 Gardien géant : ton gardien grossit et bouche la cage |
| Sinon | ⚡ Turbo : sprint de 3 secondes |

## Développement

    npm install
    npm run dev

`src/sim.ts` contient toutes les règles du jeu, sans affichage : c'est ce fichier qui tournera sur le téléphone hôte en multijoueur. `src/scene.ts` affiche et lit les commandes.
