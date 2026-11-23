// Fluidité de block-pose par style : CPU ralenti, Chrome headless, page servie depuis maj/<dossier>.
// Mesure au repos (2 s), pendant un glisser de pièce (40 mouvements) et pendant l'effacement d'une ligne :
// intervalles entre images (requestAnimationFrame) et temps de tâche du fil principal (Performance.getMetrics).
// Usage : RATE=4 node perf-styles.mjs <dossier du dépôt (avec index.html) ou maj/BSxx> [styles] [largeur] [hauteur]
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9396
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
}).listen(8796, '127.0.0.1')

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
const BASE = 'http://127.0.0.1:8796/'

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
  const rangees = Array.from({ length: 10 }, (_, l) => (l === 9 ? 'xxxxxx....' : (l >= 6 ? 'oooooooooo'.replace(/./g, (c, k) => ((l + k) % 3 === 0 ? 'v' : 'r')) : '..........')))
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
  for (const style of STYLES) {
    await charger(partieLigne(), style)
    const gm = await geom(); const e = gm.emp[0]
    const x0 = e.x + e.w / 2, y0 = e.y + e.h / 2
    await toucher('touchStart', x0, y0)
    await attendre(500)
    // la pièce monte sur la grille vide (rangées 0 à 5), va et vient en travers, descend jusqu'à la rangée qui s'efface
    const chemin = []
    const haut = gm.g.y + gm.g.h * 0.28, bas = gm.g.y + gm.g.h * 0.5
    for (let s = 1; s <= 12; s++) chemin.push([x0 + ((gm.g.x + gm.g.w * 0.15 - x0) * s) / 12, y0 + ((haut - y0) * s) / 12])
    for (let t = 0; t < 2; t++) {
      for (let s = 0; s <= 36; s++) chemin.push([gm.g.x + gm.g.w * (0.15 + 0.7 * (s / 36)), haut + (bas - haut) * (t % 2 === 0 ? s / 36 : 1 - s / 36)])
      for (let s = 36; s >= 0; s--) chemin.push([gm.g.x + gm.g.w * (0.15 + 0.7 * (s / 36)), bas - (bas - haut) * (s / 36)])
    }
    const g2x = gm.g.x + (6 + e.wc / 2) * gm.cell, g2y = gm.g.y + (9 + e.hc) * gm.cell + 1.15 * gm.cell
    const [dx, dy] = chemin[chemin.length - 1]
    for (let s = 1; s <= 20; s++) chemin.push([dx + ((g2x - dx) * s) / 20, dy + ((g2y - dy) * s) / 20])
    evenements.length = 0
    await cdp('Tracing.start', { categories: 'disabled-by-default-devtools.timeline.invalidationTracking,devtools.timeline,disabled-by-default-devtools.timeline,blink,cc', transferMode: 'ReportEvents' })
    const glisse = await mesurer(async () => {
      for (const [x, y] of chemin) { await toucher('touchMove', x, y); await attendre(8) }
      await attendre(300)
    })
    const fini = new Promise((r) => { globalThis.__fin = r })
    await cdp('Tracing.end')
    await fini
    const parNom = new Map()
    for (const e of evenements) {
      if (e.ph !== 'X' || !e.dur) continue
      const a = parNom.get(e.name) ?? { n: 0, dur: 0, max: 0 }
      a.n++; a.dur += e.dur; a.max = Math.max(a.max, e.dur); parNom.set(e.name, a)
    }
    const pris = ['RunTask', 'Paint', 'RasterTask', 'UpdateLayoutTree', 'Layout', 'FunctionCall', 'Blink.ForcedStyleAndLayout.UpdateTime', 'LocalFrameView::RunPaintLifecyclePhase', 'Layerize', 'PrePaint', 'Commit', 'CompositeLayers', 'Decode Image', 'ImageDecodeTask', 'GPUTask', 'DrawLazyPixelRef']
    const ligne = pris.map((k) => { const a = parNom.get(k); return a ? `${k}=${f1(a.dur / 1000)}ms(max ${f1(a.max / 1000)}, n ${a.n})` : null }).filter(Boolean).join('  ')
    console.log(`== ${style}: ${ligne}`)
    if (process.env.LONG) { let t0 = Infinity; for (const e of evenements) if (e.ts && e.ts < t0) t0 = e.ts
      const longs = evenements.filter((e) => e.ph === 'X' && e.name === 'RunTask' && e.dur > Number(process.env.LONG) * 1000)
      for (const L of longs) { const sous = evenements.filter((e) => e.ph === 'X' && e.tid === L.tid && e.ts >= L.ts && e.ts + e.dur <= L.ts + L.dur && e.dur > 4000 && e !== L)
        console.log('LONG', f1((L.ts - t0) / 1000), f1(L.dur / 1000), sous.map((e) => `${e.name}:${f1(e.dur / 1000)}${e.args?.data?.nodeName ? '[' + e.args.data.nodeName + ']' : ''}${e.args?.data?.type ? '[' + e.args.data.type + ']' : ''}`).join(' ')) } }
    if (process.env.TOP) console.log([...parNom].sort((x, y) => y[1].dur - x[1].dur).slice(0, 40).map(([k, a]) => `${k}=${f1(a.dur / 1000)}/${a.n}`).join('  '))
    if (process.env.DEBUG) { let t0 = Infinity; for (const e of evenements) if (e.ts && e.ts < t0) t0 = e.ts; for (const e of evenements) if (((e.name === 'Paint' || e.name === 'RasterTask') && e.dur > Number(process.env.DEBUG)) || e.name === 'PaintInvalidationTracking') console.log(e.name, f1((e.ts - t0) / 1000), f1(e.dur / 1000), JSON.stringify(e.args).slice(0, 200)) }
    await toucher('touchEnd')
    await attendre(300)
    lignes.push({ style, glisse, n: chemin.length })
  }
  console.log(`CPU ralenti x${RATE}, ${W}x${H}, ${dossier}  (glisser sur la grille vide puis vers une ligne à compléter)`)
  console.log('style      | mouvements  duree s | images  med   p95   max  | tache ms  style ms  mise en page ms')
  for (const { style, glisse: g, n } of lignes) {
    console.log(`${style.padEnd(10)} | ${String(n).padStart(6)}  ${f1(g.ms / 1000).padStart(8)} | ${String(g.n).padStart(5)} ${f1(g.med).padStart(5)} ${f1(g.p95).padStart(5)} ${f1(g.max).padStart(5)} | ${f1(g.tache).padStart(8)} ${f1(g.style).padStart(9)} ${f1(g.mise).padStart(15)}`)
  }
}
try { await main() } catch (e) { console.log('ERREUR', e.message) } finally { try { chrome.kill() } catch {} serveur.close(); process.exit(0) }
