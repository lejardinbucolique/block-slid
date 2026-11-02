// Empreinte des fichiers précachés par sw.js, gardée avec la VERSION qu'elle accompagne.
// Régénérer après avoir changé VERSION : node tools/empreinte.js
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
export const FICHIER_EMPREINTE = join(RACINE, "test", "empreinte-precache.json");

// Lit VERSION et FICHIERS dans sw.js sans l'importer.
export function lireSw() {
  const source = readFileSync(join(RACINE, "sw.js"), "utf8");
  const version = source.match(/const VERSION = "([^"]+)"/)[1];
  const liste = source.match(/const FICHIERS = \[([\s\S]*?)\]/)[1];
  const fichiers = [...liste.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((f) => f !== "./");
  return { version, fichiers };
}

// Hache chaque fichier, fins de ligne normalisées pour les textes.
export function calculerEmpreinte(fichiers) {
  const h = createHash("sha256");
  for (const f of fichiers) {
    let octets = readFileSync(join(RACINE, f));
    if (!/\.png$/i.test(f)) octets = Buffer.from(octets.toString("utf8").replace(/\r\n/g, "\n"));
    h.update(f + "\0").update(octets).update("\0");
  }
  return h.digest("hex");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { version, fichiers } = lireSw();
  const empreinte = calculerEmpreinte(fichiers);
  writeFileSync(FICHIER_EMPREINTE, JSON.stringify({ version, empreinte }, null, 2) + "\n");
  console.log(`${version} ${empreinte}`);
}
