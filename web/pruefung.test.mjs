// node --test web/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { papierform, pruefeIban, SCHRITTE } from "./pruefung.js";

const lies = (pfad) => JSON.parse(readFileSync(new URL(pfad, import.meta.url)));
const registry = lies("../spec/iban-registry.json").countries;
const vektoren = lies("../spec/test-vectors.json");

test("gültige Testvektoren bestehen alle Schritte", () => {
  for (const iban of vektoren.valid) {
    assert.equal(pruefeIban(iban, registry).gueltig, true, iban);
    assert.equal(pruefeIban(papierform(iban).toLowerCase(), registry).gueltig, true, iban);
  }
});

test("ungültige Testvektoren werden abgelehnt", () => {
  for (const { iban, reason } of vektoren.invalid) {
    assert.equal(pruefeIban(iban, registry).gueltig, false, `${iban}: ${reason}`);
  }
});

test("Schritte laufen der Reihe nach, nach einem Fehler bleibt der Rest offen", () => {
  const status = (iban) => pruefeIban(iban, registry).schritte.map((s) => s.status);
  assert.deepEqual(status(""), ["offen", "offen", "offen"]);
  assert.deepEqual(status("DE8937040044053201300"), ["fehler", "offen", "offen"]);
  assert.deepEqual(status("DE89370400440532013001"), ["ok", "fehler", "offen"]);
  assert.deepEqual(status("DE89370400440532013000"), ["ok", "ok", "ok"]);
  assert.deepEqual(status("DE973704004405320130A0"), ["ok", "ok", "fehler"]);
});

test("Prüfziffern außerhalb 02–98 werden abgelehnt", () => {
  // rechnerisch Rest 1, aber nie regulär erzeugt
  for (const z of ["00", "01", "99"]) {
    for (let k = 0; k < 97; k++) {
      const iban = `DE${z}3704004405320130${String(k).padStart(2, "0")}`;
      assert.equal(pruefeIban(iban, registry).gueltig, false, iban);
    }
  }
});

test("Strukturschritt nennt den Abschnitt, der nicht passt", () => {
  const schritt = pruefeIban("GB55WEST1234569876543A", registry).schritte[2];
  assert.equal(schritt.status, "fehler");
  assert.match(schritt.meldung, /^Stellen 15–22: Erwartet werden 8 Ziffern, dort steht „9876543A“\./);
});

test("Strukturschritt urteilt wie die Regex der Registry", () => {
  for (const iban of vektoren.valid) {
    const land = registry[iban.slice(0, 2)];
    // jedes Zeichen der BBAN einmal gegen ein Zeichen der anderen Art tauschen
    for (let i = 4; i < iban.length; i++) {
      const getauscht = iban.slice(0, i) + (/[0-9]/.test(iban[i]) ? "X" : "7") + iban.slice(i + 1);
      const erwartet = new RegExp(`^${land.iban_regex}$`).test(getauscht);
      const schritt = SCHRITTE.find((s) => s.id === "struktur").pruefe(getauscht, land);
      assert.equal(schritt.status === "ok", erwartet, getauscht);
    }
  }
});
