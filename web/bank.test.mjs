// node --test web/bank.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { BASIS, bankverzeichnis, bankzeilen } from "./bank.js";

const ERSTE = {
  land: "AT",
  bankleitzahl: "20111",
  bic: "GIBAATWWXXX",
  name: "Erste Bank der oesterreichischen Sparkassen AG",
  status: "aktiv",
  entfernt_am: null,
  adresse: { strasse: "Am Belvedere 1", plz: "1100", ort: "Wien", bundesland: "Wien" },
};

/** Ersatz für fetch: liefert aus `seiten`, sonst 404, und zählt die Aufrufe. */
function netz(seiten) {
  const aufrufe = [];
  const holen = async (url) => {
    aufrufe.push(url.replace(BASIS, ""));
    const inhalt = seiten[url.replace(BASIS, "")];
    if (inhalt instanceof Error) throw inhalt;
    return { ok: inhalt !== undefined, status: inhalt === undefined ? 404 : 200, json: async () => inhalt };
  };
  return { holen, aufrufe };
}

const INDEX = { "/index.json": { laender: { AT: { anzahl: 875 } } } };

test("gefundene Bank wird geliefert und nur einmal geladen", async () => {
  const { holen, aufrufe } = netz({ ...INDEX, "/AT/20111.json": ERSTE });
  const suche = bankverzeichnis(holen);
  assert.deepEqual(await suche("AT", "20111"), { status: "gefunden", bank: ERSTE });
  await suche("AT", "20111");
  assert.deepEqual(aufrufe, ["/index.json", "/AT/20111.json"]);
});

test("unbekannte Bankleitzahl und Land ohne Verzeichnis", async () => {
  const { holen, aufrufe } = netz(INDEX);
  const suche = bankverzeichnis(holen);
  assert.deepEqual(await suche("AT", "19043"), { status: "unbekannt" });
  assert.deepEqual(await suche("DE", "37040044"), { status: "kein_verzeichnis" });
  // für Länder ohne Verzeichnis geht keine Bankleitzahl ins Netz
  assert.deepEqual(aufrufe, ["/index.json", "/AT/19043.json"]);
});

test("nach einem Netzfehler wird beim nächsten Mal neu geladen", async () => {
  const seiten = { "/index.json": new Error("offline") };
  const { holen } = netz(seiten);
  const suche = bankverzeichnis(holen);
  await assert.rejects(suche("AT", "20111"), /offline/);
  Object.assign(seiten, INDEX, { "/AT/20111.json": ERSTE });
  assert.equal((await suche("AT", "20111")).status, "gefunden");
});

test("Anzeigezeilen", () => {
  assert.deepEqual(bankzeilen({ status: "gefunden", bank: ERSTE }), [
    ["Bank", ERSTE.name],
    ["BIC", "GIBAATWWXXX"],
    ["Ort", "1100 Wien"],
  ]);
  assert.deepEqual(bankzeilen({ status: "unbekannt" }), [["Bank", "nicht im Bankverzeichnis gefunden"]]);
  assert.deepEqual(bankzeilen({ status: "kein_verzeichnis" }), []);
  const alt = { ...ERSTE, status: "entfernt", entfernt_am: "2026-03-01", adresse: { plz: null, ort: null } };
  assert.deepEqual(bankzeilen({ status: "gefunden", bank: alt }), [
    ["Bank", `${ERSTE.name} (seit 01.03.2026 nicht mehr im Verzeichnis)`],
    ["BIC", "GIBAATWWXXX"],
  ]);
});
