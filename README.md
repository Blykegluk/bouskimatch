# Bouskimatch

Petit jeu de foot rigolo pour enfants (6-12 ans), jouable dans le navigateur sur téléphone et ordinateur.

## Où on en est

Étape 4 sur 5 : six personnages dessinés et animés, stade avec public et panneaux, effets
d'aptitudes, célébrations de but et sons de foule.

Étape suivante : mise en ligne finale (test par les enfants, corrections).

## Les personnages

Chaque personnage est entièrement dessiné par le code, à partir de la fiche dans
`src/characters.ts` : couleur, oreilles (chat, antenne, cornes, grenouille, tentacules, crête),
yeux, motif, et deux petits réglages de vitesse et de puissance. Ajouter un personnage, c'est
ajouter une ligne : aucune image à télécharger, et le dessin reste net à toutes les tailles —
le gardien géant est le même dessin, en plus gros.

Ils courent (les pieds bougent), clignent des yeux, ouvrent la bouche en sprintant, tournent
la tête vers là où ils vont, voient trente-six chandelles quand ils sont renversés et sautent
de joie après un but.

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
