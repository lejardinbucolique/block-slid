// Difficulté progressive de block-pose du niveau 1 au niveau 10 (BS57) : la difficulté monte d'un
// niveau au suivant sans jamais baisser, sur les tables qui la règlent et sur des parties du robot
// glouton (tools/mesure-niveaux-pose.js). Le calage complet se lit avec tools/progression-pose.js
// (pertes pour mille poses : 0, 0, 0,06, 0,13, 0,44, 0,94, 1,6, 3,3, 7,1, 10 du niveau 1 au niveau 10).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NIVEAU_MIN,
  NIVEAU_MAX,
  NIVEAU_DIFFICILE,
  NIVEAU_APERCU_JOUABLE,
  AIDES,
  HOSTILITES,
  RANGS,
  aideDuNiveau,
  hostiliteDuNiveau,
  rangDuNiveau,
} from '../src/pose/index.js'
import { mesurer } from '../tools/mesure-niveaux-pose.js'

const NIVEAUX = Array.from({ length: NIVEAU_MAX - NIVEAU_MIN + 1 }, (_, i) => NIVEAU_MIN + i)

// Une table qui ne change jamais de sens d'un niveau au suivant (sens 1 : monte, -1 : baisse).
function va(table, sens, nom) {
  assert.equal(table.length, NIVEAUX.length, nom)
  for (let i = 1; i < table.length; i++) assert.ok(sens * (table[i] - table[i - 1]) >= 0, `${nom} : niveau ${i + 1} (${table})`)
  assert.ok(sens * (table[table.length - 1] - table[0]) > 0, `${nom} : du premier au dernier niveau`)
}

test('les tables du tirage : l\'aide baisse, la hostilité et le rang du candidat gardé montent, niveau après niveau', () => {
  va(AIDES, -1, 'aide')
  va(HOSTILITES, 1, 'hostilité')
  va(RANGS, 1, 'rang')
  for (const n of NIVEAUX) {
    assert.equal(aideDuNiveau(n), AIDES[n - 1])
    assert.equal(hostiliteDuNiveau(n), HOSTILITES[n - 1])
    assert.equal(rangDuNiveau(n), RANGS[n - 1])
  }
  assert.equal(AIDES[0], 1, 'aide pleine au niveau 1')
  assert.equal(RANGS[0], 0, 'au niveau 1, le candidat le plus large')
  assert.equal(RANGS[NIVEAU_MAX - 1], 1, 'au niveau 10, le plus serré')
})

test('le niveau 6 est le premier difficile : ni aide, ni filet de la future main, un tirage hostile dès lui', () => {
  assert.equal(NIVEAU_DIFFICILE, 6)
  for (const n of NIVEAUX) {
    if (n < NIVEAU_DIFFICILE) {
      assert.ok(aideDuNiveau(n) > 0, `niveau ${n} : aide`)
      assert.equal(hostiliteDuNiveau(n), 0, `niveau ${n} : pas de hostilité`)
    } else {
      assert.equal(aideDuNiveau(n), 0, `niveau ${n} : plus d'aide`)
      assert.ok(hostiliteDuNiveau(n) > 0, `niveau ${n} : hostilité`)
    }
  }
  assert.ok(NIVEAU_APERCU_JOUABLE < NIVEAU_DIFFICILE)
})

test('le robot glouton : la grille se remplit de plus en plus du niveau 1 au niveau 6, sans reculer', () => {
  const remplissage = NIVEAUX.slice(0, 6).map((niveau) => mesurer({ niveau, parties: 6, plafond: 90 }).remplissage)
  for (let i = 1; i < remplissage.length; i++) assert.ok(remplissage[i] >= remplissage[i - 1] - 1.5, `niveau ${i + 1} : ${remplissage}`)
  for (let i = 3; i < remplissage.length; i++) assert.ok(remplissage[i] > remplissage[i - 3], `niveau ${i + 1} contre ${i - 2} : ${remplissage}`)
  assert.ok(remplissage[5] - remplissage[0] > 8, `${remplissage}`)
})

test('le robot glouton : les parties perdues avant 250 poses ne baissent jamais du niveau 6 au niveau 10', () => {
  const perdues = NIVEAUX.slice(5).map((niveau) => mesurer({ niveau, parties: 10, plafond: 250 }).bloquees)
  for (let i = 1; i < perdues.length; i++) assert.ok(perdues[i] >= perdues[i - 1] - 1, `niveau ${i + 6} : ${perdues}`)
  assert.ok(perdues[4] >= perdues[0] + 4, `${perdues}`)
  assert.ok(perdues[4] >= 8, `le niveau 10 se perd presque toujours : ${perdues}`)
})
