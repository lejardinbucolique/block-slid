// Le renouvellement de la main de block-pose (BS61) : la dernière pièce de la main se pose, la main suivante arrive
// et l'aperçu est tiré de nouveau (le tirage de fin de tour). CPU ralenti, Chrome headless, un vrai geste au doigt.
// Rapporte, par style : le temps du traitement du relâchement (pointerup : la pose, le tirage), la tâche la plus
// longue, l'image la plus longue et le nombre d'images au-dessus de 33 ms, de la pose à 700 ms après.
// Usage : RATE=4 node renouvellement-pose.mjs <dépôt> [styles] [largeur] [hauteur]
//   NIVEAU=1 (le niveau de la partie)  LONG=<ms> (liste les tâches plus longues avec leur contenu)  PROFIL=1 (les fonctions JS qui coûtent le plus)  CHAUFFE=25 (parties tirées avant la mesure pour échauffer le code)  TOURS=6 (renouvellements par style, sur des graines différentes)
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9398
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
}).listen(8798, '127.0.0.1')

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
const BASE = 'http://127.0.0.1:8798/'

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
  return { g: { x: g.left, y: g.top, w: g.width, h: g.height }, cell, emp: [...document.querySelectorAll('#pose-main .pose-emplacement')].map(s => { const p = s.querySelector('.pose-piece'); if (!p) return null; const r = p.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }) } })()`)
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
const NIVEAU = Number(process.env.NIVEAU ?? 1)
const TOURS = Number(process.env.TOURS ?? 6)
// Une grille de milieu de partie, la dernière pièce de la main (un bloc d'une case) à poser ; l'aperçu a ses trois pièces.
const partieFinDeTour = (graine) => {
  const e = depuisTexte({ enCours: [null, null, 'bloc.0'], suivantes: ['barre2.0', 'coin.0', 'carre2.0'], reserve, niveau: NIVEAU, graine, defi })
  const ex = JSON.parse(J(exporterPartie(e)))
  ex.grille = Array.from({ length: 10 }, (_, l) => Array.from({ length: 10 }, (_, c) => ((l + c * 2) % 5 === 0 || l < 2 ? null : ids[(l * 3 + c) % 20])))
  ex.enCours = ex.enCours.map((p) => p && { ...p, couleur: 'framboise' })
  ex.suivantes = ex.suivantes.map((p, i) => ({ ...p, couleur: ['orange', 'violet', 'sapin'][i] }))
  return ex
}
const instrumenter = () => evalJs(`(() => { window.__t = []; window.__ev = []; document.addEventListener('pointerup', (e) => { const t0 = performance.now(); queueMicrotask(() => {}); window.__up = t0 }, true)
  const f = (t) => { window.__t.push(t); window.__r = requestAnimationFrame(f) }; window.__r = requestAnimationFrame(f); return 1 })()`)
const resultat = () => evalJs(`(() => { cancelAnimationFrame(window.__r); const t = window.__t; const d = t.slice(1).map((x, i) => x - t[i]); const max = (a) => a.reduce((m, x) => Math.max(m, x), 0)
  return { imgMax: max(d), imgs33: d.filter((x) => x > 33.4).length, imgs: d.length } })()`)

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
  for (const style of STYLES) {
    const mesures = []
    const propres = new Map()
    for (let tour = 0; tour < TOURS; tour++) {
      await charger(partieFinDeTour(5 + tour), style)
      // Le code du tirage s'est échauffé en jouant : quelques parties tirées dans la page même (mêmes modules que l'appli).
      await evalJs(`import('./src/pose/index.js').then((m) => { for (let i = 0; i < ${Number(process.env.CHAUFFE ?? 25)}; i++) m.nouvellePartie({ niveau: ${NIVEAU}, graine: 100 + i, reserve: m.reserveInitiale() }); return 1 })`)
      const gm = await geom(); const e = gm.emp[2]
      const x0 = e.x + e.w / 2, y0 = e.y + e.h / 2
      const cx = gm.g.x + 4.5 * gm.cell, cy = gm.g.y + 0.5 * gm.cell + 1.15 * gm.cell // une case vide en haut de la grille
      await toucher('touchStart', x0, y0); await attendre(300)
      for (let s = 1; s <= 24; s++) { await toucher('touchMove', x0 + ((cx - x0) * s) / 24, y0 + ((cy - y0) * s) / 24); await attendre(8) }
      await attendre(300)
      await instrumenter()
      evenements.length = 0
      await cdp('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc', transferMode: 'ReportEvents' })
      if (process.env.PROFIL) { await cdp('Profiler.enable'); await cdp('Profiler.setSamplingInterval', { interval: 200 }); await cdp('Profiler.start') }
      await toucher('touchEnd'); await attendre(700)
      if (process.env.PROFIL) {
        const { profile } = await cdp('Profiler.stop'); const dt = profile.timeDeltas; const noeuds = new Map(profile.nodes.map((n) => [n.id, n]))
        for (const id of profile.samples.keys()) { const n = noeuds.get(profile.samples[id]); const k = `${n.callFrame.functionName || '(anonyme)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`; propres.set(k, (propres.get(k) ?? 0) + dt[id] / 1000) }
      }
      const r = await resultat()
      const fini = new Promise((res) => { globalThis.__fin = res })
      await cdp('Tracing.end'); await fini
      const dispatch = evenements.filter((x) => x.ph === 'X' && x.name === 'EventDispatch' && x.args?.data?.type === 'pointerup')
      const taches = evenements.filter((x) => x.ph === 'X' && x.name === 'RunTask')
      if (process.env.LONG) {
        let t0 = Infinity; for (const x of evenements) if (x.ts && x.ts < t0) t0 = x.ts
        for (const L of taches.filter((x) => x.dur > Number(process.env.LONG) * 1000)) {
          const sous = evenements.filter((x) => x.ph === 'X' && x.tid === L.tid && x.ts >= L.ts && x.ts + x.dur <= L.ts + L.dur && x.dur > Number(process.env.MIN ?? 3) * 1000 && x !== L)
          console.log(`  LONG ${style} à ${f1((L.ts - t0) / 1000)} ms : ${f1(L.dur / 1000)} ms  ` + sous.map((x) => `${x.name}:${f1(x.dur / 1000)}${x.args?.data?.nodeName ? '[' + x.args.data.nodeName.slice(0, 40) + ']' : ''}${x.args?.data?.type ? '[' + x.args.data.type + ']' : ''}`).join(' '))
        }
      }
      mesures.push({ ...r, up: dispatch.reduce((m, x) => Math.max(m, x.dur / 1000), 0), tache: taches.reduce((m, x) => Math.max(m, x.dur / 1000), 0) })
    }
    const moy = (k) => mesures.reduce((a, m) => a + m[k], 0) / mesures.length
    const pire = (k) => Math.max(...mesures.map((m) => m[k]))
    if (process.env.PROFIL) console.log('PROFIL (ms propres par tour, CPU ralenti, relâchement + 700 ms) :', [...propres].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${f1(v / TOURS)} ${k}`).join(' | '))
    console.log(`${style.padEnd(8)} niveau ${NIVEAU}  pointerup moy ${f1(moy('up')).padStart(5)} ms pire ${f1(pire('up')).padStart(5)}  tâche la plus longue ${f1(pire('tache')).padStart(5)} ms  image max ${f1(pire('imgMax')).padStart(5)} ms (${mesures.reduce((a, m) => a + m.imgs33, 0)} > 33 sur ${TOURS} tours)`)
  }
  console.log(`CPU ralenti x${RATE}, ${W}x${H}, ${dossier}`)
}
try { await main() } catch (e) { console.log('ERREUR', e.message) } finally { try { chrome.kill() } catch {} serveur.close(); process.exit(0) }
