# Bouskimatch

Petit jeu de foot rigolo pour enfants (6-12 ans), jouable dans le navigateur sur téléphone et ordinateur.

## Où on en est

Étape 1 sur 5 : prototype solo (terrain, ballon, un joueur, un gardien, les buts, commandes tactiles et clavier).

Étapes suivantes : vrai match 3 contre 3 avec aptitudes, jeu à deux en ligne avec un code de partie, effets et sons, mise en ligne finale.

## Commandes

- Téléphone : joystick à gauche, bouton ballon pour tirer (maintenir pour tirer plus fort), bouton nuage pour la glissade.
- Ordinateur : flèches ou ZQSD pour bouger, Espace pour tirer, Maj pour la glissade.

## Développement

    npm install
    npm run dev

`src/sim.ts` contient toutes les règles du jeu, sans affichage : c'est ce fichier qui tournera sur le téléphone hôte en multijoueur. `src/scene.ts` affiche et lit les commandes.
