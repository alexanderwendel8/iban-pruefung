// Bankdaten aus dem BIC-Verzeichnis (https://github.com/alexanderwendel8/bic-verzeichnis).
// Ohne DOM; `holen` ist austauschbar, damit die Logik ohne Netz testbar ist.

export const SEITE = "https://alexanderwendel8.github.io/bic-verzeichnis";
export const BASIS = `${SEITE}/api/v1`;

// Länder, deren Verzeichnis nicht nach der Bankkennung der IBAN-Registry geführt wird.
// Ungarn: achtstelliger Filialcode = Bank (3), Filiale (4) und Prüfziffer (1) am Anfang der BBAN.
const SCHLUESSEL = {
  HU: (iban) => iban.slice(4, 12),
};

/** Schlüssel, unter dem das Verzeichnis die Bank einer (formal gültigen) IBAN führt. */
export function bankschluessel(iban, bankleitzahl) {
  return SCHLUESSEL[iban.slice(0, 2)]?.(iban) ?? bankleitzahl;
}

/**
 * Erzeugt eine Abfrage mit eigenem Zwischenspeicher.
 *
 * `suche(land, schluessel)` liefert
 *   { status: "gefunden", bank, quelle } – Datensatz der API
 *   { status: "unbekannt", quelle }      – Land wird geführt, Bankleitzahl nicht
 *   { status: "kein_verzeichnis" }       – für das Land gibt es keine Bankdaten
 * und wirft, wenn das Verzeichnis nicht erreichbar ist. `quelle` ist die
 * Pflicht-Quellenangabe des Landes: { name, hinweis, url, bedingungen, lizenz, bic_hinweis }.
 *
 * `laender()` liefert die geführten Länder als Map Code -> Name.
 */
export function bankverzeichnis(holen = (url) => fetch(url)) {
  const ablage = new Map(); // URL -> Promise<JSON | null>

  // Fehlgeschlagene Abrufe nicht merken, damit der nächste Versuch neu lädt
  function json(url) {
    if (!ablage.has(url)) {
      const abruf = (async () => {
        const antwort = await holen(url);
        if (antwort.status === 404) return null;
        if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
        return antwort.json();
      })();
      ablage.set(url, abruf);
      abruf.catch(() => ablage.delete(url));
    }
    return ablage.get(url);
  }

  const uebersicht = async () => (await json(`${BASIS}/index.json`))?.laender ?? {};

  async function quelle(land) {
    const kurz = (await uebersicht())[land];
    // Wortlaut und Links stehen in der Länderdatei der Verzeichnis-Webseite;
    // fehlt sie, bleibt der Name der Quelle aus der API-Übersicht.
    const lang = (await json(`${SEITE}/laender.json`).catch(() => null))?.[land];
    return {
      name: kurz.quelle,
      hinweis: lang?.quelle?.hinweis ?? `Quelle: ${kurz.quelle}`,
      url: lang?.quelle?.url ?? SEITE,
      bedingungen: lang?.quelle?.bedingungen ?? null,
      lizenz: lang?.quelle?.lizenz ?? null,
      bic_hinweis: lang?.zusatz_hinweis || null,
    };
  }

  return {
    async laender() {
      return new Map(Object.entries(await uebersicht()).map(([code, l]) => [code, l.name ?? code]));
    },
    async suche(land, schluessel) {
      // Nur Länder abfragen, die das Verzeichnis führt
      if (!Object.hasOwn(await uebersicht(), land)) return { status: "kein_verzeichnis" };
      const [bank, q] = await Promise.all([
        json(`${BASIS}/${land}/${encodeURIComponent(schluessel)}.json`),
        quelle(land),
      ]);
      return bank ? { status: "gefunden", bank, quelle: q } : { status: "unbekannt", quelle: q };
    },
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
  // Polen und Ungarn führen je Filiale einen Eintrag; die Bezeichnung nennt die Einheit
  const einheit = bank.bezeichnung && bank.bezeichnung !== bank.name ? bank.bezeichnung : null;
  const hinweise = [
    bank.loeschung_angekuendigt ? "Löschung der Bankleitzahl ist angekündigt" : null,
    bank.nachfolge_bankleitzahl ? `Nachfolge-Bankleitzahl ${bank.nachfolge_bankleitzahl}` : null,
  ].filter(Boolean);
  return [
    ["Bank", `${bank.name}${entfernt}`],
    ["Einheit", einheit],
    ["BIC", bank.bic ?? "im Verzeichnis nicht hinterlegt"],
    ["Ort", ort || null],
    ["Hinweis", hinweise.join("; ") || null],
  ].filter(([, wert]) => wert);
}

const KOPF = {
  id: "bank",
  titel: "Bank",
  beschreibung: "Die Bankleitzahl muss im Bankverzeichnis des Landes stehen.",
};

/**
 * Prüfschritt „Bank“ im selben Format wie die Schritte aus pruefung.js.
 * `ergebnis` ist das Ergebnis von `suche` oder einer der Zustände
 *   null                 – Schritt noch nicht erreicht
 *   "laeuft"             – Abfrage unterwegs
 *   "nicht_erreichbar"   – Verzeichnis nicht erreichbar
 * Status: ok | fehler | offen | laeuft | entfaellt (kein Verzeichnis) | unklar.
 */
export function bankschritt(ergebnis, land, bankleitzahl) {
  const schritt = (status, meldung = "", details = []) => ({ ...KOPF, status, meldung, details });
  if (ergebnis === null) return schritt("offen");
  if (ergebnis === "laeuft") return schritt("laeuft", "Die Bank wird im Bankverzeichnis nachgeschlagen …");
  if (ergebnis === "nicht_erreichbar") {
    return schritt("unklar", "Das Bankverzeichnis ist nicht erreichbar, die Bank konnte nicht geprüft werden.");
  }
  if (ergebnis.status === "kein_verzeichnis") {
    return schritt("entfaellt", `Für ${land} liegt kein Bankverzeichnis vor, die Bank wird nicht geprüft.`);
  }
  if (ergebnis.status === "unbekannt") {
    return schritt("fehler", `Die Bankleitzahl ${bankleitzahl} steht nicht im Bankverzeichnis für ${land}.`, [
      ["Bankleitzahl", bankleitzahl],
    ]);
  }
  const details = [["Bankleitzahl", bankleitzahl], ...bankzeilen(ergebnis)];
  const { bank } = ergebnis;
  if (bank.status === "entfernt") {
    const seit = bank.entfernt_am ? ` seit ${datum(bank.entfernt_am)}` : "";
    const nachfolge = bank.nachfolge_bankleitzahl
      ? ` Nachfolge-Bankleitzahl: ${bank.nachfolge_bankleitzahl}.`
      : "";
    return schritt(
      "fehler",
      `Die Bank mit der Bankleitzahl ${bankleitzahl} (${bank.name}) steht${seit} nicht mehr im Bankverzeichnis.${nachfolge}`,
      details,
    );
  }
  return schritt("ok", `Die Bankleitzahl ${bankleitzahl} gehört zu ${bank.name}.`, details);
}
