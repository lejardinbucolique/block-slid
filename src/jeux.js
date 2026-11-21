// Les jeux de l'appli (BS39) : un registre, sans écran ni navigateur, pour se tester seul.
//
// Un jeu qui n'est pas « disponible » n'apparaît pas dans les réglages et ne peut pas
// être choisi : même une valeur gardée qui le désignerait retombe sur block-slid.
// Pour mettre un jeu en ligne, il suffit de passer son `disponible` à true.

export const JEU_BLOCK_SLID = 'block-slid'
export const JEU_BLOCK_POSE = 'block-pose'

export const JEU_PAR_DEFAUT = JEU_BLOCK_SLID

export const JEUX = Object.freeze([
  Object.freeze({ id: JEU_BLOCK_SLID, nom: 'Block slid', disponible: true }),
  Object.freeze({ id: JEU_BLOCK_POSE, nom: 'Block pose', disponible: true }),
])

// Les jeux qu'on peut choisir, dans l'ordre du registre.
export const jeuxDisponibles = () => JEUX.filter((j) => j.disponible)

// La ligne « Jeu » des réglages n'a de sens qu'avec un vrai choix.
export const choixDeJeuVisible = () => jeuxDisponibles().length > 1

// Un jeu lu du stockage : absent, abîmé, inconnu ou pas disponible = block-slid.
export const jeuLu = (valeur) =>
  typeof valeur === 'string' && jeuxDisponibles().some((j) => j.id === valeur) ? valeur : JEU_PAR_DEFAUT
