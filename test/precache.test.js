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
