// node --test web/bank.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { SEITE, bankschluessel, bankschritt, bankverzeichnis, bankzeilen } from "./bank.js";

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
    const pfad = url.replace(SEITE, "");
    aufrufe.push(pfad);
    const inhalt = seiten[pfad];
    if (inhalt instanceof Error) throw inhalt;
    return { ok: inhalt !== undefined, status: inhalt === undefined ? 404 : 200, json: async () => inhalt };
  };
  return { holen, aufrufe };
}

const INDEX = {
  "/api/v1/index.json": {
    laender: {
      AT: { name: "Österreich", quelle: "Oesterreichische Nationalbank", anzahl: 875 },
      IT: { name: "Italien", quelle: "Banca d'Italia", anzahl: 2196 },
    },
  },
};
const LAENDER = {
  "/laender.json": {
    AT: {
      quelle: { hinweis: "Quelle: OeNB, Lizenz CC BY 4.0.", url: "https://oenb.example/", bedingungen: "https://oenb.example/b", lizenz: "https://cc.example/" },
      zusatz_hinweis: "",
    },
    IT: { quelle: { hinweis: "Fonte: Banca d'Italia.", url: "https://bdi.example/" }, zusatz_hinweis: "SWIFT © 2026." },
  },
};
const Q_AT = {
  name: "Oesterreichische Nationalbank",
  hinweis: "Quelle: OeNB, Lizenz CC BY 4.0.",
  url: "https://oenb.example/",
  bedingungen: "https://oenb.example/b",
  lizenz: "https://cc.example/",
  bic_hinweis: null,
};

test("gefundene Bank kommt mit Quellenangabe und wird nur einmal geladen", async () => {
  const { holen, aufrufe } = netz({ ...INDEX, ...LAENDER, "/api/v1/AT/20111.json": ERSTE });
  const { suche } = bankverzeichnis(holen);
  assert.deepEqual(await suche("AT", "20111"), { status: "gefunden", bank: ERSTE, quelle: Q_AT });
  await suche("AT", "20111");
  assert.deepEqual(aufrufe.sort(), ["/api/v1/AT/20111.json", "/api/v1/index.json", "/laender.json"]);
});

test("unbekannte Bankleitzahl und Land ohne Verzeichnis", async () => {
  const { holen, aufrufe } = netz({ ...INDEX, ...LAENDER });
  const { suche } = bankverzeichnis(holen);
  assert.deepEqual(await suche("AT", "19043"), { status: "unbekannt", quelle: Q_AT });
  assert.deepEqual(await suche("NL", "ABNA"), { status: "kein_verzeichnis" });
  // für Länder ohne Verzeichnis geht keine Bankleitzahl ins Netz
  assert.ok(!aufrufe.some((a) => a.includes("NL")));
  assert.equal((await suche("IT", "03069")).quelle.bic_hinweis, "SWIFT © 2026.");
});

test("ohne Länderdatei bleibt der Name der Quelle aus der Übersicht", async () => {
  const { holen } = netz({ ...INDEX, "/api/v1/AT/20111.json": ERSTE });
  const { quelle } = await bankverzeichnis(holen).suche("AT", "20111");
  assert.equal(quelle.hinweis, "Quelle: Oesterreichische Nationalbank");
  assert.equal(quelle.url, SEITE);
});

test("geführte Länder", async () => {
  const { holen } = netz(INDEX);
  assert.deepEqual([...(await bankverzeichnis(holen).laender())], [["AT", "Österreich"], ["IT", "Italien"]]);
});

test("nach einem Netzfehler wird beim nächsten Mal neu geladen", async () => {
  const seiten = { "/api/v1/index.json": new Error("offline") };
  const { holen } = netz(seiten);
  const { suche } = bankverzeichnis(holen);
  await assert.rejects(suche("AT", "20111"), /offline/);
  Object.assign(seiten, INDEX, LAENDER, { "/api/v1/AT/20111.json": ERSTE });
  assert.equal((await suche("AT", "20111")).status, "gefunden");
});

test("Schlüssel im Verzeichnis: Bankleitzahl, in Ungarn der achtstellige Filialcode", () => {
  assert.equal(bankschluessel("AT592011100000123456", "20111"), "20111");
  assert.equal(bankschluessel("HU42117730161111101800000000", "117"), "11773016");
  assert.equal(bankschluessel("IT60X0542811101000000123456", "05428"), "05428");
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

  // ohne BIC (z. B. Zweigstellen in Spanien), mit Einheit (Polen) und Hinweisen (Deutschland)
  const bank = { ...ERSTE, bic: null, bezeichnung: "1 Oddział w Warszawie", loeschung_angekuendigt: true, nachfolge_bankleitzahl: "10010010" };
  assert.deepEqual(bankzeilen({ status: "gefunden", bank }), [
    ["Bank", ERSTE.name],
    ["Einheit", "1 Oddział w Warszawie"],
    ["BIC", "im Verzeichnis nicht hinterlegt"],
    ["Ort", "1100 Wien"],
    ["Hinweis", "Löschung der Bankleitzahl ist angekündigt; Nachfolge-Bankleitzahl 10010010"],
  ]);
});

test("Prüfschritt Bank", () => {
  const status = (ergebnis) => bankschritt(ergebnis, "Österreich", "20111").status;
  assert.equal(status(null), "offen");
  assert.equal(status("laeuft"), "laeuft");
  assert.equal(status("nicht_erreichbar"), "unklar");
  assert.equal(status({ status: "kein_verzeichnis" }), "entfaellt");
  assert.equal(status({ status: "gefunden", bank: ERSTE }), "ok");

  const unbekannt = bankschritt({ status: "unbekannt" }, "Österreich", "19043");
  assert.equal(unbekannt.status, "fehler");
  assert.equal(unbekannt.meldung, "Die Bankleitzahl 19043 steht nicht im Bankverzeichnis für Österreich.");

  const alt = { ...ERSTE, status: "entfernt", entfernt_am: "2026-03-01", nachfolge_bankleitzahl: "3268" };
  const entfernt = bankschritt({ status: "gefunden", bank: alt }, "Österreich", "20111");
  assert.equal(entfernt.status, "fehler");
  assert.match(entfernt.meldung, /seit 01\.03\.2026 nicht mehr im Bankverzeichnis\. Nachfolge-Bankleitzahl: 3268\.$/);
});
