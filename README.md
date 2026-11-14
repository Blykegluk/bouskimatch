# Bouskimatch

Petit jeu de foot rigolo pour enfants (6-12 ans), jouable dans le navigateur sur téléphone et ordinateur.

## Où on en est

**V1 en ligne** : https://blykegluk.github.io/bouskimatch/

Les cinq étapes prévues sont faites : prototype, match 3 contre 3, jeu à deux en ligne,
personnages et rendu, finitions.

La suite suit `docs/PROGRESSION.md`. Le lot C (rendu) est fait en partie : les
personnages ont une tête, un maillot, des bras et des jambes au lieu d'être des
boules, quatre terrains au choix (stade, château, arc-en-ciel, plage) et des buts
plus grands avec un gardien moins infaillible — `node tools/balance.ts` rejoue des
matchs entiers sans navigateur pour mesurer ça (un enfant marquait 0,9 but par
match en facile, il en marque 3,1).

Le lot A est en place : chaque match rapporte des
ballons d’or (partie jouée, victoire, buts, but au canon, arrêts, première partie du jour),
l’écran de fin les égrène un par un, et la barre de niveau se remplit — 30 niveaux, rien ne
se perd jamais, et rien de tout ça ne rend plus fort contre un copain. Le niveau et le total
sont affichés au menu, gardés dans le navigateur.

## Sur le téléphone

Ouvre le lien, tourne le téléphone en paysage, et touche le bouton ⛶ pour le plein écran.
Pour l'avoir comme une appli : menu du navigateur → « Ajouter à l'écran d'accueil ».

Pendant un match, le bouton ⏸ en haut à gauche (ou Échap) ouvre la pause : reprendre,
couper le son, ou revenir au menu. Un match solo se met en pause tout seul si le téléphone
se verrouille. Le mode d'emploi s'affiche à la première partie, et le « ? » du menu le rouvre.

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
