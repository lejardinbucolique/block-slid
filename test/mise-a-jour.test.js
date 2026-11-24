import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suivreGestes, animationEnCours, rechargerApresGeste, verifierRegulierement, INTERVALLE_VERIFICATION } from '../src/ui/mise-a-jour.js'

const faux = () => {
  const ecoutes = {}
  return {
    visibilityState: 'visible',
    addEventListener: (t, f) => (ecoutes[t] ??= []).push(f),
    emettre: (t, e = {}) => (ecoutes[t] || []).forEach((f) => f(e)),
  }
}

test('la vérification tourne toutes les 5 minutes, seulement app visible', () => {
  const doc = faux(); const actifs = new Map(); let n = 0
  verifierRegulierement({ doc, verifier: () => {}, minuteur: (f, d) => { actifs.set(++n, d); return n }, arreter: (id) => actifs.delete(id) })
  assert.deepEqual([...actifs.values()], [INTERVALLE_VERIFICATION])
  assert.equal(INTERVALLE_VERIFICATION, 300000)
  doc.visibilityState = 'hidden'; doc.emettre('visibilitychange')
  assert.equal(actifs.size, 0)
  doc.visibilityState = 'visible'; doc.emettre('visibilitychange'); doc.emettre('visibilitychange')
  assert.equal(actifs.size, 1)
})

test('le rechargement attend la fin du geste, puis se fait aussitôt', () => {
  const doc = faux(); const tenu = suivreGestes(doc)
  let recharges = 0; const enAttente = []
  doc.emettre('pointerdown', { pointerId: 1 })
  rechargerApresGeste({ occupe: tenu, recharger: () => recharges++, attendre: (f) => enAttente.push(f) })
  assert.equal(recharges, 0)
  enAttente.shift()(); assert.equal(recharges, 0)
  doc.emettre('pointerup', { pointerId: 1 })
  enAttente.shift()(); assert.equal(recharges, 1)
})

test('une animation finie en cours retient le rechargement, pas un décor en boucle', () => {
  const anim = (iterations, playState = 'running') => ({ playState, effect: { getTiming: () => ({ iterations }) } })
  assert.equal(animationEnCours({ getAnimations: () => [anim(Infinity)] }), false)
  assert.equal(animationEnCours({ getAnimations: () => [anim(1, 'finished')] }), false)
  assert.equal(animationEnCours({ getAnimations: () => [anim(1)] }), true)
  assert.equal(animationEnCours({}), false)
})
