// Fluidité du glisser d'une pièce dans block-pose (BS59) : un vrai geste continu, CPU ralenti, Chrome headless.
// Doigt posé sur une pièce de la main, tiré vers la grille, entrée sur la grille, survol de plusieurs places,
// pause, puis (scénario « ligne ») jusqu'à la place qui complète une ligne, relâchement.
// Rapporte, par style et par scénario : le plus long retard entre un mouvement du doigt et son traitement par la
// page (la pièce suit le doigt à ce moment-là), l'image la plus longue, le nombre d'images au-dessus de 33 ms.
// Usage : RATE=4 node glisse-fluide-pose.mjs <dépôt> [styles] [largeur] [hauteur]
//   SCENARIOS=milieu,ligne  LONG=<ms> liste les tâches plus longues, avec leur contenu et le décompte des dessins  CSS="…" injecte une règle (essai) ; GESTE=2 répète le geste.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9397
const [, , dossier, LISTE = 'uni,laine,beton,bois,bonbon,papier,metal,verre,marbre,neon,gemme', LARG = '412', HAUT = '800'] = process.argv
const W = Number(LARG), H = Number(HAUT)
const STYLES = LISTE.split(',')
const racine = existsSync(join(dossier, 'index.html')) ? dossier : join(process.cwd(), 'maj', dossier)
const M = await import(pathToFileURL(join(racine, 'src/pose/index.js')).href)
const { depuisTexte, exporterPartie, PALETTE } = M

const profil = mkdtempSync(join(tmpdir(), 'bs-perf-'))
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' }
const serveur = createServer((req, res) => {
  let p = new URL(req.url, 'http://x').pathname
  if (p.endsWith('/')) p += 'index.html'
  const f = join(racine, p)
  if (!existsSync(f)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
  res.end(readFileSync(f))
}).listen(8797, '127.0.0.1')

let ws, id = 0
const attentes = new Map()
async function connecter() {
  for (let i = 0; i < 50; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find((x) => x.type === 'page'); if (p) return p.webSocketDebuggerUrl } catch {}
    await attendre(200)
  }
  throw new Error('Chrome ne répond pas')
}
const cdp = (method, params = {}) => new Promise((res, rej) => { const n = ++id; attentes.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })) })
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails)); return r.result.value }
const J = (x) => JSON.stringify(x)
const BASE = 'http://127.0.0.1:8797/'

const ids = PALETTE.map((c) => c.id)
function grilleMelangee() {
  const g = Array.from({ length: 10 }, () => Array(10).fill(null))
  let k = 0
  for (let l = 3; l < 10; l++) for (let c = 0; c < 10; c++) { if ((l * 7 + c * 3) % 11 === 0) continue; g[l][c] = ids[k++ % 20] }
  return g
}
const reserve = { supprimer: 3, tourner: 3, changer: 3, annuler: 3 }
const defi = { points: 99999, coups: 8, scoreDebut: 0, coupsFaits: 0 }
function partieCouleurs() {
  const e = depuisTexte({ enCours: ['coin.0', 'barre3.0', 'carre2.0'], suivantes: ['bloc.0', 'barre2.0', 'coin.0'], reserve, niveau: 4, graine: 5, defi })
  const ex = JSON.parse(J(exporterPartie(e)))
  ex.grille = grilleMelangee()
  ex.enCours = ex.enCours.map((p, i) => ({ ...p, couleur: ['framboise', 'turquoise', 'citron'][i] }))
  ex.suivantes = ex.suivantes.map((p, i) => ({ ...p, couleur: ['orange', 'violet', 'sapin'][i] }))
  return ex
}
function partieLigne() {
  const rangees = Array.from({ length: 10 }, (_, l) => (l === 9 ? 'xxxxxx....' : (l >= 9 - Number(process.env.PLEINES ?? 3) ? 'oooooooooo'.replace(/./g, (c, k) => ((l + k) % 3 === 0 ? 'v' : 'r')) : '..........')))
  const e = depuisTexte({ rangees, enCours: ['barre4.0', 'bloc.0', 'barre2.0'], suivantes: ['bloc.0', 'barre2.0', 'coin.0'], reserve, niveau: 4, graine: 5, defi })
  const ex = JSON.parse(J(exporterPartie(e)))
  const map = { x: 'bleu', o: 'orange', v: 'vert', r: 'rouge' }
  ex.grille = ex.grille.map((r) => r.map((v) => (v === null ? null : map[v] ?? v)))
  ex.enCours = ex.enCours.map((p, i) => ({ ...p, couleur: ['violet', 'jaune', 'turquoise'][i] }))
  return ex
}
async function charger(partie, style) {
  await cdp('Page.navigate', { url: BASE }); await attendre(300)
  await evalJs(`(() => { localStorage.clear(); localStorage.setItem('appli.jeu', 'block-pose'); localStorage.setItem('block-pose.meilleur', '2000000'); localStorage.setItem('block-pose.style', ${J(style)});
    localStorage.setItem('block-pose.reserve', ${J(J(reserve))}); localStorage.setItem('block-pose.partie', ${J(J(partie))}) })()`)
  await cdp('Page.navigate', { url: BASE }); await attendre(1500); if (process.env.CSS) await evalJs('(() => { const s = document.createElement("style"); s.textContent = ' + J(process.env.CSS) + '; document.head.appendChild(s) })()'); if (process.env.JS) console.log('JS', await evalJs(process.env.JS)); await attendre(300)
}
const toucher = (type, x, y) => cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
const geom = () => evalJs(`(() => { const g = document.getElementById('pose-grille').getBoundingClientRect(); const cell = parseFloat(getComputedStyle(document.getElementById('pose')).getPropertyValue('--cell'));
  return { g: { x: g.left, y: g.top, w: g.width, h: g.height }, cell, emp: [...document.querySelectorAll('#pose-main .pose-emplacement')].map(s => { const p = s.querySelector('.pose-piece'); const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, wc: getComputedStyle(p).gridTemplateColumns.split(' ').length, hc: getComputedStyle(p).gridTemplateRows.split(' ').length } }) } })()`)
const metriques = async () => Object.fromEntries((await cdp('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
const enregistrer = () => evalJs(`(() => { window.__t = []; const f = (t) => { window.__t.push(t); window.__r = requestAnimationFrame(f) }; window.__r = requestAnimationFrame(f); return 1 })()`)
const arreter = () => evalJs(`(() => { cancelAnimationFrame(window.__r); const t = window.__t; const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b); const q = (p) => d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : 0; return { n: t.length, med: q(.5), p95: q(.95), max: d[d.length - 1] ?? 0 } })()`)
async function mesurer(f) {
  const m0 = await metriques(); await enregistrer(); const t0 = Date.now()
  await f()
  const ms = Date.now() - t0
  const r = await arreter(); const m1 = await metriques()
  return { ms, ...r, tache: (m1.TaskDuration - m0.TaskDuration) * 1000, style: (m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000, mise: (m1.LayoutDuration - m0.LayoutDuration) * 1000 }
}
const f1 = (x) => String(Math.round(x * 10) / 10)


const evenements = []
const f1b = (x) => String(Math.round(x * 10) / 10)
// LONG=<ms> : trace le geste et liste les tâches plus longues que ça, avec ce qu'elles contiennent (MIN=<ms> règle le plus petit sous-événement montré).
async function listerLongues(style, sc) {
  const fini = new Promise((r) => { globalThis.__fin = r })
  await cdp('Tracing.end'); await fini
  let t0 = Infinity; for (const e of evenements) if (e.ts && e.ts < t0) t0 = e.ts
  // Le décompte des dessins (indépendant de la charge du poste) : combien de fois chaque élément est redessiné, et ce que coûtent les images.
  const dessins = new Map()
  for (const e of evenements) if (e.ph === 'X' && (e.name === 'Paint' || e.name === 'PaintImage')) {
    const cle = `${e.name} ${e.args?.data?.nodeName ?? ''}`.slice(0, 90)
    const a = dessins.get(cle) ?? { n: 0, dur: 0 }
    a.n++; a.dur += e.dur / 1000; dessins.set(cle, a)
  }
  console.log(`  DESSINS ${style} ${sc} : ` + [...dessins].sort((x, y) => y[1].dur - x[1].dur).slice(0, 6).map(([k, a]) => `${k} x${a.n} ${f1b(a.dur)} ms`).join(' | '))
  if (process.env.REPERES) {
    const reperes = evenements.filter((e) => e.ph === 'X' && ((e.name === 'EventDispatch' && ['pointerdown', 'pointerup'].includes(e.args?.data?.type)) || (e.name === 'Paint' && e.dur > 3000 && e.args?.data?.nodeName?.includes('pose'))))
    console.log('  REPERES ' + reperes.sort((a, b) => a.ts - b.ts).map((e) => `${e.name === 'Paint' ? 'Paint ' + e.args.data.nodeName.slice(0, 50) : e.args.data.type}@${f1b((e.ts - t0) / 1000)}(${f1b(e.dur / 1000)})`).join(' ; '))
  }
  const seuil = Number(process.env.LONG) * 1000, min = Number(process.env.MIN ?? 3) * 1000
  for (const L of evenements.filter((e) => e.ph === 'X' && e.name === 'RunTask' && e.dur > seuil)) {
    const sous = evenements.filter((e) => e.ph === 'X' && e.tid === L.tid && e.ts >= L.ts && e.ts + e.dur <= L.ts + L.dur && e.dur > min && e !== L)
    console.log(`  LONG ${style} ${sc} à ${f1b((L.ts - t0) / 1000)} ms : ${f1b(L.dur / 1000)} ms  ` + sous.map((e) => `${e.name}:${f1b(e.dur / 1000)}${e.args?.data?.nodeName ? '[' + e.args.data.nodeName + ']' : ''}${e.args?.data?.type ? '[' + e.args.data.type + ']' : ''}`).join(' '))
  }
  evenements.length = 0
}

const SCENARIOS = (process.env.SCENARIOS ?? 'milieu,ligne').split(',')
const REPET = Number(process.env.GESTE ?? 2)
const partieMilieu = () => {
  const ex = partieCouleurs()
  // Une grille de milieu de partie : trous partout, aucune ligne ni colonne pleine, la pièce se pose où elle veut.
  ex.grille = Array.from({ length: 10 }, (_, l) => Array.from({ length: 10 }, (_, c) => ((l + c * 2) % 5 === 0 || l < 2 ? null : ids[(l * 3 + c) % 20])))
  return ex
}
const instrumenter = () => evalJs(`(() => { window.__lag = []; window.__t = []; document.addEventListener('pointerdown', (e) => { window.__lag.push(performance.now() - e.timeStamp) }, true); document.addEventListener('pointermove', (e) => { window.__lag.push(performance.now() - e.timeStamp) }, true)
  const f = (t) => { window.__t.push(t); window.__r = requestAnimationFrame(f) }; window.__r = requestAnimationFrame(f); return 1 })()`)
const resultat = () => evalJs(`(() => { cancelAnimationFrame(window.__r); const t = window.__t; const d = t.slice(1).map((x, i) => x - t[i]); const l = window.__lag
  const max = (a) => a.reduce((m, x) => Math.max(m, x), 0)
  return { n: l.length, lagMax: max(l), lag50: l.filter((x) => x > 33).length, imgMax: max(d), imgs33: d.filter((x) => x > 33.4).length, imgs: d.length } })()`)

async function main() {
  ws = new WebSocket(await connecter())
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data)
    if (d.id && attentes.has(d.id)) { const a = attentes.get(d.id); attentes.delete(d.id); d.error ? a.rej(new Error(JSON.stringify(d.error))) : a.res(d.result) }
    else if (d.method === 'Tracing.dataCollected') evenements.push(...d.params.value)
    else if (d.method === 'Tracing.tracingComplete') { globalThis.__fin?.() }
  })
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Performance.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true })
  const RATE = Number(process.env.RATE ?? 4)
  await cdp('Emulation.setCPUThrottlingRate', { rate: RATE })
  const lignes = []
  for (const style of STYLES) for (const sc of SCENARIOS) {
    await charger(sc === 'ligne' ? partieLigne() : partieMilieu(), style)
    const gm = await geom(); const e = gm.emp[0]
    const x0 = e.x + e.w / 2, y0 = e.y + e.h / 2
    const gx = (f) => gm.g.x + gm.g.w * f, gy = (f) => gm.g.y + gm.g.h * f
    const chemin = []
    const vers = (xa, ya, xb, yb, n) => { for (let s = 1; s <= n; s++) chemin.push([xa + ((xb - xa) * s) / n, ya + ((yb - ya) * s) / n]) }
    // de la main à la grille (par le bas, puis en entrant par le haut du plateau), survol, pause
    vers(x0, y0, gx(0.5), gy(1.05), 14)
    vers(gx(0.5), gy(1.05), gx(0.3), gy(0.55), 18)
    vers(gx(0.3), gy(0.55), gx(0.8), gy(0.35), 24)
    vers(gx(0.8), gy(0.35), gx(0.2), gy(0.2), 24)
    for (let s = 0; s < 6; s++) chemin.push(chemin[chemin.length - 1])
    if (sc === 'ligne') {
      const cx = gm.g.x + (6 + e.wc / 2) * gm.cell, cy = gm.g.y + (9 + e.hc) * gm.cell + 1.15 * gm.cell
      vers(gx(0.2), gy(0.2), cx, cy, 24)
      for (let s = 0; s < 8; s++) chemin.push(chemin[chemin.length - 1])
      chemin.push('PHOTO')
      vers(cx, cy, gx(0.5), gy(0.4), 20)
    }
    const mesures = []
    for (let r = 0; r < REPET; r++) {
      await instrumenter(); const t0 = Date.now()
      if (process.env.LONG) await cdp('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc', transferMode: 'ReportEvents' })
      await toucher('touchStart', x0, y0); await attendre(400)
      for (const pas of chemin) {
        if (pas === 'PHOTO') { if (process.env.PHOTOS && r === 0) { await attendre(300); const { data } = await cdp('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(join(process.env.PHOTOS, `${style}-${sc}.png`), Buffer.from(data, 'base64')) } continue }
        await toucher('touchMove', pas[0], pas[1]); await attendre(8)
      }
      await attendre(250)
      mesures.push({ ...(await resultat()), ms: Date.now() - t0 })
      if (process.env.LONG) await listerLongues(style, sc)
      // Le doigt se relève hors de la grille : la pièce revient, rien ne se pose, la grille reste la même d'un geste à l'autre.
      await toucher('touchMove', x0, y0 + 40); await attendre(300)
      await toucher('touchEnd'); await attendre(900)
    }
    const pire = (k) => Math.max(...mesures.map((m) => m[k]))
    const somme = (k) => mesures.reduce((a, m) => a + m[k], 0)
    lignes.push({ style, sc, lagMax: pire('lagMax'), lag33: somme('lag50'), imgMax: pire('imgMax'), imgs33: somme('imgs33'), n: somme('n') })
    console.log(`${style.padEnd(8)} ${sc.padEnd(6)} retard max ${f1(pire('lagMax')).padStart(6)} ms (${somme('lag50')} > 33)  image max ${f1(pire('imgMax')).padStart(6)} ms (${somme('imgs33')} > 33)  sur ${somme('n')} mouvements`)
  }
  console.log(`CPU ralenti x${RATE}, ${W}x${H}, ${dossier}`)
}
try { await main() } catch (e) { console.log('ERREUR', e.message) } finally { try { chrome.kill() } catch {} serveur.close(); process.exit(0) }
