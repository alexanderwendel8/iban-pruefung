import { bankverzeichnis, bankzeilen } from "./bank.js";
import { papierform, pruefeIban } from "./pruefung.js";

const sucheBank = bankverzeichnis();

const eingabe = document.getElementById("iban");
const ergebnis = document.getElementById("ergebnis");
const liste = document.getElementById("schritte");
const details = document.getElementById("details");
const angaben = document.getElementById("angaben");

const STATUSTEXT = { ok: "bestanden", fehler: "nicht bestanden", offen: "noch nicht geprüft" };

function element(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text !== undefined) e.textContent = text;
  return e;
}

function zeigeAngaben(zeilen) {
  angaben.replaceChildren(
    ...zeilen.flatMap(([name, wert]) => [element("dt", "", name), element("dd", "", wert)]),
  );
}

/** Schlägt die Bank nach und hängt ihre Daten an, sofern die Eingabe noch dieselbe ist. */
async function ergaenzeBank(iban, bankleitzahl, zeilen) {
  angaben.dataset.iban = iban;
  let bank;
  try {
    bank = bankzeilen(await sucheBank(iban.slice(0, 2), bankleitzahl));
  } catch {
    bank = [["Bank", "Bankverzeichnis nicht erreichbar"]];
  }
  if (angaben.dataset.iban === iban && !angaben.hidden) zeigeAngaben([...zeilen, ...bank]);
}

function zeige(registry) {
  const pruefung = pruefeIban(eingabe.value, registry);

  ergebnis.dataset.status = pruefung.leer ? "offen" : pruefung.gueltig ? "ok" : "fehler";
  ergebnis.textContent = pruefung.leer
    ? ""
    : pruefung.gueltig
      ? `${papierform(pruefung.iban)} hat alle Prüfschritte bestanden.`
      : `Diese IBAN ist nicht gültig. ${pruefung.schritte.find((s) => s.status === "fehler").meldung}`;

  angaben.hidden = !pruefung.gueltig;
  angaben.dataset.iban = "";
  if (pruefung.gueltig) {
    const a = pruefung.angaben;
    const zeilen = [
      ["Land", a.land],
      ["SEPA-Teilnahme", a.sepa ? "ja" : "nein"],
      ["Bankleitzahl", a.bankleitzahl],
      ["Filiale", a.filiale], // null bei Ländern ohne Filialkennung
      ["Kontonummer", a.kontonummer],
    ].filter(([, wert]) => wert !== null);
    zeigeAngaben(zeilen);
    ergaenzeBank(pruefung.iban, a.bankleitzahl, zeilen);
  }

  // Ohne Details bleibt nur das Ergebnis sichtbar
  liste.hidden = !details.checked;

  liste.replaceChildren(
    ...pruefung.schritte.map((schritt, i) => {
      const li = element("li", "schritt");
      li.dataset.status = schritt.status;
      const kopf = element("div", "kopf");
      kopf.append(
        element("span", "nummer", String(i + 1)),
        element("h2", "", schritt.titel),
        element("span", "status", STATUSTEXT[schritt.status]),
      );
      li.append(kopf, element("p", "meldung", schritt.meldung || schritt.beschreibung));
      if (schritt.details.length) {
        const dl = element("dl");
        for (const [name, wert] of schritt.details) {
          dl.append(element("dt", "", name), element("dd", "", wert));
        }
        li.append(dl);
      }
      return li;
    }),
  );
}

try {
  const antwort = await fetch("spec/iban-registry.json");
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
  const registry = (await antwort.json()).countries;
  document.getElementById("anzahl").textContent = Object.keys(registry).length;
  eingabe.addEventListener("input", () => zeige(registry));
  details.addEventListener("change", () => zeige(registry));
  zeige(registry);
} catch (fehler) {
  const hinweis = document.getElementById("ladefehler");
  hinweis.textContent = `Die Länderformate konnten nicht geladen werden (${fehler.message}).`;
  hinweis.hidden = false;
  eingabe.disabled = true;
}
