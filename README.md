# Bouskimatch

Petit jeu de foot rigolo pour enfants (6-12 ans), jouable dans le navigateur sur téléphone et ordinateur.

## Où on en est

Étape 3 sur 5 : jeu à deux en ligne, chacun sur son téléphone, avec un code de partie à 4 lettres
ou un lien à envoyer. Deux modes : ensemble contre l'ordinateur, ou l'un contre l'autre.

Étapes suivantes : personnages et rendu soignés, mise en ligne finale.

## Jouer à deux

Un enfant touche « Jouer à deux », puis « Créer une partie » : il obtient un code de 4 lettres et un
lien à envoyer. L'autre ouvre le lien, ou tape le code dans « Rejoindre », et le match démarre.

Les deux téléphones se parlent directement (WebRTC, via le serveur d'annuaire gratuit de PeerJS) :
aucun compte, aucun serveur à nous, aucune donnée gardée. Le téléphone qui a créé la partie fait
l'arbitre : il calcule tout le match et envoie l'image aux deux. Si un joueur se déconnecte,
l'ordinateur reprend son personnage et le match continue.

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
