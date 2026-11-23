// Ce qui se voit réellement quand une ligne disparaît dans block-slid : événements d'animation CSS, images produites,
// images enregistrées (screencast). Usage : RATE=4 STYLE=laine node anim-slid.mjs <dépôt ou maj/BSxx> [largeur]
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, extname } from 'node:path'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9411
const [, , dossier, LARG = '412'] = process.argv
const W = Number(LARG)
const RATE = Number(process.env.RATE ?? 4)
const STYLE = process.env.STYLE ?? 'laine'
const racine = existsSync(join(dossier, 'index.html')) ? dossier : join(process.cwd(), 'maj', dossier)
const M = await import(pathToFileURL(join(racine, 'src/moteur/index.js')).href)
const base = M.exporterPartie(M.nouvellePartie({ graine: 5, reglages: M.REGLAGES }))
const bloc = (id, ligne, col, largeur, couleur) => ({ id, ligne, col, largeur, couleur })
// Une ligne disparaît : le bloc 202 glisse à droite, tombe dans le trou et complète la rangée du bas ; deux lignes à
// compléter d'un coup pour que la chute se voie aussi.
const B = { ...base, blocs: [bloc(200, 14, 0, 3, 'bleu'), bloc(201, 14, 3, 4, 'vert'), bloc(202, 13, 6, 1, 'rouge'), bloc(203, 13, 0, 2, 'jaune'), bloc(204, 12, 3, 2, 'orange')], score: 100, coups: 0, prochainId: 300 }

const profil = mkdtempSync(join(tmpdir(), 'bs-anim-'))
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
}).listen(8811, '127.0.0.1')

let ws, id = 0
const attentes = new Map(), trames = []
async function connecter() {
  for (let i = 0; i < 50; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find((x) => x.type === 'page'); if (p) return p.webSocketDebuggerUrl } catch {}
    await attendre(200)
  }
  throw new Error('Chrome ne répond pas')
}
const cdp = (method, params = {}) => new Promise((res, rej) => { const n = ++id; attentes.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })) })
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails)); return r.result.value }
const RECT_BLOC = (i) => `(() => { const e = document.querySelector('.bloc[data-id="${i}"]'); if (!e) return null; const b = e.getBoundingClientRect(); const cw = parseFloat(getComputedStyle(document.getElementById('plateau')).getPropertyValue('--cw')); return { x: b.left, y: b.top, w: b.width, h: b.height, cw } })()`

try {
  ws = new WebSocket(await connecter())
  await new Promise((r) => (ws.onopen = r))
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && attentes.has(d.id)) { const a = attentes.get(d.id); attentes.delete(d.id); d.error ? a.rej(new Error(JSON.stringify(d.error))) : a.res(d.result) }
    else if (d.method === 'Page.screencastFrame') { trames.push({ t: d.params.metadata.timestamp, data: d.params.data }); ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: d.params.sessionId } })) }
  }
  await cdp('Runtime.enable'); await cdp('Page.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: 915, deviceScaleFactor: 2, mobile: true })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true })
  await cdp('Page.navigate', { url: 'http://127.0.0.1:8811/' }); await attendre(1500)
  await evalJs(`localStorage.clear(); localStorage.setItem('block-slid.partie', ${JSON.stringify(JSON.stringify(B))}); localStorage.setItem('block-slid.meilleur', '20000'); localStorage.setItem('block-slid.style', '${STYLE}'); 0`)
  await cdp('Page.reload'); await attendre(2000)
  await cdp('Emulation.setCPUThrottlingRate', { rate: RATE })
  const r = await evalJs(RECT_BLOC(202))
  // instrumentation : événements d'animation + intervalles entre images
  await evalJs(`(() => { window.__ev = []; window.__fr = []; const t0 = performance.now(); window.__t0 = t0;
    for (const n of ['animationstart', 'animationend', 'animationcancel']) document.addEventListener(n, (e) => { const el = e.target.closest('.bloc'); window.__ev.push({ n, a: e.animationName, t: Math.round(performance.now() - t0), col: el ? el.style.getPropertyValue('--col') : '?', cl: el ? [...el.classList].filter((c) => ['allume', 'efface', 'glisse', 'entre'].includes(c)).join('+') : '' }) }, true)
    const f = (t) => { window.__fr.push(Math.round(t - t0)); requestAnimationFrame(f) }; requestAnimationFrame(f); 0 })()`)
  await cdp('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 })
  const debut = Date.now()
  const px = r.x + r.w / 2, py = r.y + r.h / 2
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py }] })
  for (let i = 1; i <= 6; i++) await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px + (r.cw * i) / 6, y: py }] })
  const tFin = await evalJs('Math.round(performance.now() - window.__t0)')
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await attendre(2500)
  await cdp('Page.stopScreencast')
  const res = await evalJs('({ ev: window.__ev, fr: window.__fr, fin: ' + tFin + ', score: document.getElementById("score").textContent })')
  // rapport
  console.log(`style ${STYLE}, CPU x${RATE}, ${W} px, lâcher du doigt à t=${res.fin} ms, score ${res.score}`)
  const par = {}
  for (const e of res.ev) { if (['laine-fil', 'laine-efface', 'laine-allume'].includes(e.a) || e.a?.includes('efface') || e.a?.includes('allume') || e.a?.includes('fil')) { const k = `${e.a} ${e.cl}`; (par[k] ??= []).push(e) } }
  for (const [k, l] of Object.entries(par)) {
    const deb = l.filter((e) => e.n === 'animationstart').map((e) => e.t), fin = l.filter((e) => e.n === 'animationend').map((e) => e.t), ann = l.filter((e) => e.n === 'animationcancel').length
    console.log(`  ${k.padEnd(28)} débuts ${deb.length} (${Math.min(...deb)}..${Math.max(...deb)} ms), fins ${fin.length} (${fin.length ? Math.min(...fin) + '..' + Math.max(...fin) : '-'} ms), annulées ${ann}`)
  }
  const noms = [...new Set(res.ev.map((e) => e.a))]
  console.log('  animations vues :', noms.join(', '))
  const fr = res.fr.filter((t) => t >= res.fin)
  const d = fr.slice(1).map((x, i) => x - fr[i])
  const sur = (a, b) => fr.filter((t) => t >= a && t <= b).length
  console.log(`  images après le lâcher : ${fr.length} en ${fr.at(-1) - fr[0]} ms ; intervalle max ${Math.max(...d)} ms ; ${d.filter((x) => x > 50).length} intervalles > 50 ms`)
  const debC = par['laine-fil allume']?.filter((e) => e.n === 'animationstart').map((e) => e.t) ?? []
  const debE = par['laine-efface efface']?.filter((e) => e.n === 'animationstart').map((e) => e.t) ?? []
  if (debC.length) { const a = Math.min(...debC); console.log(`  images pendant le fil (${a}..${a + 200}) : ${sur(a, a + 200)}`) }
  if (debE.length) { const a = Math.min(...debE); console.log(`  images pendant l'effacement (${a}..${a + 200}) : ${sur(a, a + 200)}`) }
  const rep = join(process.cwd(), 'sortie-anim', `slid-${STYLE}-x${RATE}-${W}`)
  mkdirSync(rep, { recursive: true })
  const t0 = trames[0]?.t ?? 0
  trames.forEach((tr, i) => writeFileSync(join(rep, `${String(i).padStart(3, '0')}-${Math.round((tr.t - t0) * 1000)}ms.jpg`), Buffer.from(tr.data, 'base64')))
  console.log(`  ${trames.length} images enregistrées dans ${rep} (durée ${trames.length ? Math.round((trames.at(-1).t - t0) * 1000) : 0} ms)`)
  console.log('  temps (ms depuis le début) des images enregistrées :', trames.map((tr) => Math.round((tr.t - t0) * 1000)).join(' '))
} catch (e) { console.log('ERREUR', e.message) } finally { try { chrome.kill() } catch {} serveur.close(); process.exit(0) }
