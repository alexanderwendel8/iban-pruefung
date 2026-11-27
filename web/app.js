import { bankschritt, bankverzeichnis, bankzeilen } from "./bank.js";
import { papierform, pruefeIban } from "./pruefung.js";

const sucheBank = bankverzeichnis();

const eingabe = document.getElementById("iban");
const ergebnis = document.getElementById("ergebnis");
const liste = document.getElementById("schritte");
const details = document.getElementById("details");
const angaben = document.getElementById("angaben");

const STATUSTEXT = {
  ok: "bestanden",
  fehler: "nicht bestanden",
  offen: "noch nicht geprüft",
  laeuft: "wird geprüft",
  entfaellt: "entfällt",
  unklar: "nicht prüfbar",
};

function element(tag, klasse, text) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Gesamtergebnis aus allen Schritten: [Status, Text]. */
function gesamt(pruefung, schritte) {
  if (pruefung.leer) return ["offen", ""];
  const fehler = schritte.find((s) => s.status === "fehler");
  if (fehler) return ["fehler", `Diese IBAN ist nicht gültig. ${fehler.meldung}`];
  const bank = schritte.at(-1);
  if (bank.status === "laeuft") return ["offen", bank.meldung];
  if (bank.status === "unklar") {
    return ["unklar", `Länge, Prüfziffer und Struktur stimmen. ${bank.meldung}`];
  }
  return ["ok", `${papierform(pruefung.iban)} hat alle Prüfschritte bestanden.`];
}

/** Zeichnet Ergebnis, Angaben und Schritte. `bank` ist das Ergebnis der Bankabfrage oder ein Zustand. */
function zeichne(pruefung, bank) {
  const a = pruefung.angaben;
  const schritte = [...pruefung.schritte, bankschritt(bank, a?.land, a?.bankleitzahl)];
  const [status, text] = gesamt(pruefung, schritte);
  ergebnis.dataset.status = status;
  ergebnis.textContent = text;

  // Angaben erst zeigen, wenn auch die Bank geprüft ist
  angaben.hidden = status !== "ok";
  if (status === "ok") {
    const zeilen = [
      ["Land", a.land],
      ["SEPA-Teilnahme", a.sepa ? "ja" : "nein"],
      ["Bankleitzahl", a.bankleitzahl],
      ["Filiale", a.filiale], // null bei Ländern ohne Filialkennung
      ["Kontonummer", a.kontonummer],
      ...bankzeilen(bank),
    ].filter(([, wert]) => wert !== null);
    angaben.replaceChildren(
      ...zeilen.flatMap(([name, wert]) => [element("dt", "", name), element("dd", "", wert)]),
    );
  }

  // Ohne Details bleibt nur das Ergebnis sichtbar
  liste.hidden = !details.checked;
  liste.replaceChildren(
    ...schritte.map((schritt, i) => {
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

let aktuell = ""; // IBAN der laufenden Bankabfrage

async function zeige(registry) {
  const pruefung = pruefeIban(eingabe.value, registry);
  aktuell = pruefung.iban;
  if (!pruefung.gueltig) return zeichne(pruefung, null);

  zeichne(pruefung, "laeuft");
  let bank;
  try {
    bank = await sucheBank(pruefung.iban.slice(0, 2), pruefung.angaben.bankleitzahl);
  } catch {
    bank = "nicht_erreichbar";
  }
  // Antwort verwerfen, wenn inzwischen etwas anderes eingegeben wurde
  if (aktuell === pruefung.iban) zeichne(pruefung, bank);
}

try {
  const antwort = await fetch("spec/iban-registry.json");
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
  const registry = (await antwort.json()).countries;
  document.getElementById("anzahl").textContent = Object.keys(registry).length;
  eingabe.addEventListener("input", () => zeige(registry));
  details.addEventListener("change", () => zeige(registry));
  zeige(registry);
  // Länderliste des Bankverzeichnisses vorab laden, damit die erste Prüfung nicht wartet
  sucheBank("", "").catch(() => {});
} catch (fehler) {
  const hinweis = document.getElementById("ladefehler");
  hinweis.textContent = `Die Länderformate konnten nicht geladen werden (${fehler.message}).`;
  hinweis.hidden = false;
  eingabe.disabled = true;
}
