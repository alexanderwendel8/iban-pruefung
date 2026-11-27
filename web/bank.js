// Bankdaten aus dem BIC-Verzeichnis (https://github.com/alexanderwendel8/bic-verzeichnis).
// Ohne DOM; `holen` ist austauschbar, damit die Logik ohne Netz testbar ist.

export const BASIS = "https://alexanderwendel8.github.io/bic-verzeichnis/api/v1";

/**
 * Erzeugt eine Abfrage mit eigenem Zwischenspeicher. `suche(land, bankleitzahl)` liefert
 *   { status: "gefunden", bank }   – Datensatz der API
 *   { status: "unbekannt" }        – Land wird geführt, Bankleitzahl nicht
 *   { status: "kein_verzeichnis" } – für das Land gibt es keine Bankdaten
 * und wirft, wenn das Verzeichnis nicht erreichbar ist.
 */
export function bankverzeichnis(holen = (url) => fetch(url)) {
  let laender; // Promise<Set<string>>, einmal je Seitenaufruf
  const banken = new Map(); // "AT/20111" -> Promise<Ergebnis>

  async function json(url) {
    const antwort = await holen(url);
    if (antwort.status === 404) return null;
    if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
    return antwort.json();
  }

  // Fehlgeschlagene Abrufe nicht merken, damit der nächste Versuch neu lädt
  function gemerkt(ablage, schluessel, laden) {
    if (!ablage.has(schluessel)) {
      const abruf = laden();
      ablage.set(schluessel, abruf);
      abruf.catch(() => ablage.delete(schluessel));
    }
    return ablage.get(schluessel);
  }

  const uebersicht = new Map();
  return async function suche(land, bankleitzahl) {
    laender = gemerkt(uebersicht, "index", async () => {
      const index = await json(`${BASIS}/index.json`);
      return new Set(Object.keys(index?.laender ?? {}));
    });
    // Nur Länder abfragen, die das Verzeichnis führt
    if (!(await laender).has(land)) return { status: "kein_verzeichnis" };
    return gemerkt(banken, `${land}/${bankleitzahl}`, async () => {
      const bank = await json(`${BASIS}/${land}/${encodeURIComponent(bankleitzahl)}.json`);
      return bank ? { status: "gefunden", bank } : { status: "unbekannt" };
    });
  };
}

const datum = (iso) => iso.split("-").reverse().join(".");

/** Anzeigezeilen [Name, Wert] zu einem Ergebnis von `suche`. */
export function bankzeilen(ergebnis) {
  if (ergebnis.status === "kein_verzeichnis") return [];
  if (ergebnis.status === "unbekannt") return [["Bank", "nicht im Bankverzeichnis gefunden"]];
  const { bank } = ergebnis;
  const entfernt =
    bank.status === "entfernt"
      ? ` (${bank.entfernt_am ? `seit ${datum(bank.entfernt_am)} ` : ""}nicht mehr im Verzeichnis)`
      : "";
  const ort = [bank.adresse?.plz, bank.adresse?.ort].filter(Boolean).join(" ");
  return [
    ["Bank", `${bank.name}${entfernt}`],
    ["BIC", bank.bic],
    ["Ort", ort || null],
  ].filter(([, wert]) => wert);
}
