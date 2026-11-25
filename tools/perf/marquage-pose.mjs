// Coût du marquage d'un effacement dans block-pose (BS59) : combien de temps prend le recalcul de style quand
// 40 blocs (4 lignes) passent à « allume » puis à « efface », par style, CPU ralenti. Sans geste ni trace :
// la page marque les blocs et force le calcul, le temps se lit dans la page. Sert à essayer une règle (CSS="…").
// Usage : RATE=4 node marquage-pose.mjs <dépôt> [styles] [largeur] [hauteur]
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


const mesure = (nbLignes) => evalJs(`(async () => {
  const blocs = [...document.querySelectorAll('#pose-grille .pose-case')].filter((c) => c.classList.contains('occupee')).map((c) => c.firstElementChild)
  const cible = blocs.filter((b) => { const i = [...document.querySelectorAll('#pose-grille .pose-bloc')].indexOf(b); return Math.floor(i / 10) >= ${10 - nbLignes} })
  const cols = cible.map((b) => [...document.querySelectorAll('#pose-grille .pose-bloc')].indexOf(b) % 10)
  const force = () => { document.documentElement.getBoundingClientRect() }
  const t = (f) => { const a = performance.now(); f(); force(); return performance.now() - a }
  const out = {}
  out.allume = t(() => cible.forEach((b, i) => { b.style.setProperty('--col', String(cols[i])); b.style.setProperty('--duree', '320ms'); b.classList.add('allume') }))
  await new Promise((r) => setTimeout(r, 600))
  out.efface = t(() => cible.forEach((b, i) => { b.style.setProperty('--col', String(cols[i])); b.style.setProperty('--duree', '260ms'); b.classList.remove('allume', 'efface'); b.classList.add('efface') }))
  out.n = cible.length
  return out })()`)
async function main() {
  ws = new WebSocket(await connecter())
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && attentes.has(d.id)) { const a = attentes.get(d.id); attentes.delete(d.id); d.error ? a.rej(new Error(JSON.stringify(d.error))) : a.res(d.result) } })
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })
  const RATE = Number(process.env.RATE ?? 4)
  await cdp('Emulation.setCPUThrottlingRate', { rate: RATE })
  console.log('style      | 10 blocs: allume  efface | 40 blocs: allume  efface   (ms, recalcul forcé, CPU ralenti x' + RATE + ')')
  for (const style of STYLES) {
    const r = []
    for (const nb of [1, 4]) {
      await charger(partieLigne(), style)
      // la ligne du bas n'est pas pleine dans partieLigne : on prend les lignes 6 à 8 (pleines) et la 9 est complétée à la main
      await evalJs(`document.querySelectorAll('#pose-grille .pose-case').forEach((c, i) => { if (Math.floor(i / 10) === 9) { c.classList.add('occupee'); c.firstElementChild.style.setProperty('--couleur', '#c33') } })`)
      r.push(await mesure(nb))
    }
    console.log(`${style.padEnd(10)} | ${f1(r[0].allume).padStart(18)} ${f1(r[0].efface).padStart(7)} | ${f1(r[1].allume).padStart(18)} ${f1(r[1].efface).padStart(7)}`)
  }
}
try { await main() } catch (e) { console.log('ERREUR', e.message) } finally { try { chrome.kill() } catch {} serveur.close(); process.exit(0) }
