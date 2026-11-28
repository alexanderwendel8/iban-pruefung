import { bankschluessel, bankschritt, bankverzeichnis, bankzeilen } from "./bank.js";
import { papierform, pruefeIban } from "./pruefung.js";

const verzeichnis = bankverzeichnis();

const eingabe = document.getElementById("iban");
const ergebnis = document.getElementById("ergebnis");
const liste = document.getElementById("schritte");
const details = document.getElementById("details");
const angaben = document.getElementById("angaben");
const quelle = document.getElementById("quelle");

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

/** Pflicht-Quellenangabe zu den angezeigten Bankdaten; `mitBic`, wenn ein BIC gezeigt wird. */
function zeigeQuelle(q, mitBic) {
  quelle.hidden = !q;
  if (!q) return;
  const verweis = (text, url) => Object.assign(element("a", "", text), { href: url });
  const teile = [
    `Bankdaten: ${q.hinweis}`,
    verweis("Quelle", q.url),
    q.bedingungen && verweis("Nutzungsbedingungen", q.bedingungen),
    q.lizenz && verweis("Lizenz", q.lizenz),
    mitBic && q.bic_hinweis && `BIC: ${q.bic_hinweis}`,
  ].filter(Boolean);
  quelle.replaceChildren(...teile.flatMap((teil, i) => (i ? [" · ", teil] : [teil])));
}

/** Zeichnet Ergebnis, Angaben und Schritte. `bank` ist das Ergebnis der Bankabfrage oder ein Zustand. */
function zeichne(pruefung, bank) {
  const a = pruefung.angaben;
  const schluessel = a ? bankschluessel(pruefung.iban, a.bankleitzahl) : null;
  const schritte = [...pruefung.schritte, bankschritt(bank, a?.land, schluessel)];
  const [status, text] = gesamt(pruefung, schritte);
  ergebnis.dataset.status = status;
  ergebnis.textContent = text;

  // Quellenangabe, sobald Daten aus dem Verzeichnis im Spiel sind
  zeigeQuelle(bank?.quelle, Boolean(bank?.bank?.bic));

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
    const schluessel = bankschluessel(pruefung.iban, pruefung.angaben.bankleitzahl);
    bank = await verzeichnis.suche(pruefung.iban.slice(0, 2), schluessel);
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
  // Länderliste des Bankverzeichnisses vorab laden: für den Hinweis unten,
  // und damit die erste Prüfung nicht darauf wartet
  verzeichnis
    .laender()
    .then((laender) => {
      const namen = [...laender.values()].sort((x, y) => x.localeCompare(y, "de"));
      document.getElementById("banklaender").textContent = new Intl.ListFormat("de").format(namen);
    })
    .catch(() => {});
} catch (fehler) {
  const hinweis = document.getElementById("ladefehler");
  hinweis.textContent = `Die Länderformate konnten nicht geladen werden (${fehler.message}).`;
  hinweis.hidden = false;
  eingabe.disabled = true;
}
