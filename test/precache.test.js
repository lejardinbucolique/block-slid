import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lireSw, calculerEmpreinte, FICHIER_EMPREINTE } from "../tools/empreinte.js";

test("un fichier précaché change avec la VERSION de sw.js", () => {
  const garde = JSON.parse(readFileSync(FICHIER_EMPREINTE, "utf8"));
  const { version, fichiers } = lireSw();
  const empreinte = calculerEmpreinte(fichiers);
  if (empreinte === garde.empreinte) return;
  assert.notEqual(version, garde.version,
    `Un fichier précaché a changé mais VERSION est restée ${version} : changer VERSION dans sw.js, puis lancer node tools/empreinte.js.`);
  assert.fail(`VERSION est passée à ${version} : lancer node tools/empreinte.js pour mettre à jour ${FICHIER_EMPREINTE}.`);
});

// Un fichier local appelé par url() dans un CSS doit être précaché, sinon il manque hors ligne.
test("tout fichier local référencé par url() dans les CSS est précaché", () => {
  const { fichiers } = lireSw();
  const manquants = [];
  for (const css of ["style.css", "src/pose/pose.css"]) {
    const source = readFileSync(new URL(`../${css}`, import.meta.url), "utf8");
    const dossier = css.includes("/") ? css.slice(0, css.lastIndexOf("/") + 1) : "";
    for (const m of source.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)) {
      const cible = m[2].trim();
      if (/^(data:|#|%23|https?:|\/\/)/.test(cible)) continue;
      const chemin = new URL(cible, `http://x/${dossier}`).pathname.slice(1);
      if (!fichiers.includes(chemin)) manquants.push(`${css} : ${cible}`);
    }
  }
  assert.deepEqual(manquants, [], "Fichier référencé par url() absent de FICHIERS dans sw.js.");
});
