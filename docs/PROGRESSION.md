# Bouskimatch — plan de progression (à revoir avant de coder)

Objectif : plus on joue, plus on gagne des choses. Des skins, des pouvoirs,
des personnages. Pour des enfants de 6 à 12 ans, sur un jeu qui doit rester
léger (pas d’images à télécharger, pas de compte à créer).

## 1. Les quatre règles que je me fixe

1. **On ne perd jamais rien.** Pas de vies, pas de monnaie qu’on dépense, pas
   de défi qui expire. Un enfant qui joue mal gagne moins vite, jamais rien de
   négatif. Sinon le petit de 6 ans arrête.
2. **Une récompense dès la première partie, et à chaque partie.** L’écran de
   fin montre toujours quelque chose qui avance.
3. **Rien de gagné ne rend plus fort contre un copain.** Les débloquages sont
   de l’apparence et de la variété, pas de la puissance : celui qui joue depuis
   trois semaines ne doit pas écraser celui qui découvre. En match à deux, les
   deux joueurs ont accès aux mêmes pouvoirs (ceux de l’hôte).
4. **Zéro inscription.** Tout est gardé dans le navigateur de l’enfant. Un
   « code de sauvegarde » à recopier permettra de retrouver sa collection sur
   un autre appareil.

## 2. Ce qu’on gagne

**Les ballons d’or** (la monnaie, uniquement pour mesurer la progression) :

| Action | Ballons |
|---|---|
| Partie jouée jusqu’au bout | 3 |
| Match gagné | +5 |
| Match nul | +3 |
| Chaque but marqué | +2 |
| But au boulet de canon | +1 de plus |
| Arrêt du gardien géant | +1 |
| Premier match du jour | +5 |

Une partie rapporte donc 10 à 25 ballons. Les premiers débloquages arrivent
vers 20, les suivants s’espacent doucement : quelque chose de neuf toutes les
2-3 parties au début, toutes les 5-6 parties plus tard.

**Les niveaux** : un niveau tous les 60 ballons, 30 niveaux. Le niveau est le
grand chiffre affiché à côté du nom. C’est la fierté.

## 3. L’album

Un écran « Mon album » depuis le menu : des cases, les gagnées en couleur, les
autres en silhouette avec le nombre de ballons manquants. Voir ce qui vient
est la moitié du plaisir.

Contenu, par ordre d’arrivée :

- **12 tenues** (rayures, flammes, étoiles, camouflage, doré…) — purement
  décoratives, appliquées sur n’importe quel personnage.
- **8 ballons** (ballon de feu, melon, ballon de plage, boule de bowling, œuf…)
  — l’apparence change, le jeu non.
- **6 nouveaux personnages** en plus des 6 actuels : un pingouin, un fantôme,
  un lion, une abeille, un yéti, un extraterrestre. Comme les personnages sont
  dessinés par le code, chacun ne coûte rien à télécharger.
- **4 nouveaux pouvoirs** (voir §4).
- **6 célébrations** après un but : saut périlleux, danse, pluie de confettis,
  cœurs, feu d’artifice, glissade sur les genoux.
- **3 stades** : nuit sous les projecteurs, plage, stade de neige.
- **10 trophées** à collectionner (« 10 buts au canon », « gagner sans
  encaisser », « 5 victoires en champion »…), affichés dans l’album.

Soit une soixantaine de cases : de quoi tenir plusieurs semaines sans jamais
avoir fini.

## 4. Les pouvoirs

Aujourd’hui il y a quatre pouvoirs, choisis automatiquement selon la situation
(canon, tacle, gardien géant, turbo) — je garde ce principe, c’est ce qui rend
le jeu jouable à 6 ans avec un seul bouton.

Les quatre nouveaux pouvoirs **remplacent** un pouvoir existant au choix de
l’enfant, ils ne s’ajoutent pas :

- **L’aimant** (à la place du turbo) : attire le ballon pendant 2 secondes.
- **Le mur de glace** (à la place du gardien géant) : bloque un couloir devant
  son but pendant 3 secondes.
- **La tornade** (à la place du tacle) : fait tourner les adversaires proches
  sur eux-mêmes au lieu de les faire tomber.
- **La banane** (à la place du canon) : un tir moins fort mais qui tourne et
  contourne le gardien.

Un petit écran avant le match (quatre cases, des images, pas de texte) permet
de choisir sa combinaison. Chaque nouveau pouvoir est aussi fort que celui
qu’il remplace : c’est un goût, pas un avantage.

## 5. Les défis

Trois défis affichés au menu, renouvelés quand ils sont finis (pas par
chronomètre, pour qu’un enfant qui joue le mercredi ne rate rien) :
« marque 2 buts au canon », « gagne un match en champion », « fais 3 tacles ».
15 à 30 ballons chacun. Jamais de défi impossible en solo.

## 6. Le rendu, en même temps

Tu m’as dit que c’est très basique et qu’il faut de vrais personnages et un
meilleur rendu, tout en gardant le jeu léger. Ça va avec la progression :
plus il y a de choses à gagner, plus elles doivent être jolies.

- Personnages plus détaillés : corps, bras et jambes séparés, ombres douces,
  expressions du visage, maillot qui bouge. Toujours dessinés par le code.
- Terrain : pelouse tondue en bandes, ombres des joueurs, traces de glissade,
  filets qui bougent quand le ballon rentre.
- Effets : traînée derrière le ballon rapide, poussière au tacle, éclair au
  canon, ralenti d’une demi-seconde sur un but.
- Et une mesure de vitesse sur un vieux téléphone à chaque lot : si on
  descend sous 50 images par seconde, je recule.

Fait le 14/11 : personnages avec tête, maillot, bras, jambes et chaussures, qui
regardent dans la direction où ils courent ; quatre terrains au choix dans le
menu (stade, château fort, arc-en-ciel, plage), le même pour les deux joueurs en
ligne. Buts élargis et gardien moins infaillible : en facile un enfant passe
d'environ un but par match à trois.

Deuxième passe le 14/11 : chaque personnage a sa silhouette (fin, costaud, tête
carrée pour le robot), de l'ombre et de la lumière sur le maillot et la tête, des
sourcils qui froncent quand on charge un tir, et il se penche dans sa course. Le
ballon s'étire quand il file et laisse une traînée, les glissades laissent des
traces sur l'herbe, le filet se déforme sur un but, et la pelouse a de la texture
et des flaques de lumière. Coût mesuré : 3,5 ms par image au lieu de 3,2.

## 7. Les lots, dans l’ordre

| Lot | Contenu | Ce que tu verras |
|---|---|---|
| A ✅ | Ballons d’or, niveaux, écran de fin qui récompense, sauvegarde | Chaque partie fait avancer une barre |
| B | L’album + 12 tenues + 8 ballons | Un écran de collection qui se remplit |
| C ⏳ | Rendu des personnages et du terrain (§6) | Le jeu ne ressemble plus à un prototype |
| D | 6 nouveaux personnages | 12 personnages au total |
| E | 4 nouveaux pouvoirs + écran de choix | Des façons de jouer différentes |
| F | Défis, célébrations, stades, trophées | De quoi revenir longtemps |
| G | Code de sauvegarde pour changer d’appareil | La collection suit l’enfant |

Je te montre le résultat en ligne à la fin de chaque lot, tu testes avec les
enfants, et on corrige avant de passer au suivant. Si un lot ne te plaît pas,
on le refait sans toucher au reste.

## 8. Côté technique (pour mémoire)

- Un seul fichier `src/progress.ts` : les gains, les paliers, la liste des
  débloquables, la sauvegarde. Rien dans les règles du jeu.
- `src/sim.ts` ne lit jamais la progression : l’appareil hôte reste le seul
  juge du match. La combinaison de pouvoirs choisie voyage avec le message
  d’arrivée du deuxième joueur.
- Les tenues, ballons, personnages, stades et célébrations sont des fiches de
  données comme `src/characters.ts` l’est déjà : en ajouter d’autres plus tard
  ne demandera pas de code.
- Sauvegarde dans le navigateur, avec une version pour pouvoir faire évoluer
  le format sans effacer la collection d’un enfant.
