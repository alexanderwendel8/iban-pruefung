// IBAN-Prüfung in Schritten. Grundlage: docs/iban-spezifikation.md.
// Reine Logik ohne DOM, damit sie im Browser und in Node-Tests läuft.

/** Überführt die Eingabe in das elektronische Format. */
export function normalisiere(eingabe) {
  return eingabe.replace(/\s+/g, "").toUpperCase();
}

/** Papierform: Vierergruppen mit Leerzeichen. */
export function papierform(iban) {
  return iban.replace(/(.{4})(?=.)/g, "$1 ");
}

/** Rest der Division durch 97, zeichenweise gerechnet (A=10 … Z=35). */
export function mod97(zeichen) {
  let rest = 0;
  for (const z of zeichen) {
    const wert = parseInt(z, 36);
    rest = (wert < 10 ? rest * 10 + wert : rest * 100 + wert) % 97;
  }
  return rest;
}

const ok = (meldung, details = []) => ({ status: "ok", meldung, details });
const fehler = (meldung, details = []) => ({ status: "fehler", meldung, details });

/**
 * Die Prüfschritte in Ausführungsreihenfolge. Ein neuer Schritt ist ein
 * weiterer Eintrag mit `pruefe(iban, land)`; `land` ist der Registry-Eintrag
 * oder `undefined`, solange der Ländercode nicht bekannt ist.
 */
export const SCHRITTE = [
  {
    id: "laenge",
    titel: "Länge",
    beschreibung: "Jedes Land legt eine feste IBAN-Länge fest.",
    pruefe(iban, land) {
      const code = iban.slice(0, 2);
      if (!/^[A-Z]{2}$/.test(code)) {
        return fehler("Eine IBAN beginnt mit zwei Buchstaben für das Land.");
      }
      if (!land) {
        return fehler(`Für den Ländercode ${code} ist kein IBAN-Format registriert.`);
      }
      const details = [
        ["Land", `${land.name} (${code})`],
        ["Erwartet", `${land.iban_length} Zeichen`],
        ["Eingegeben", `${iban.length} Zeichen`],
      ];
      const differenz = iban.length - land.iban_length;
      if (differenz === 0) return ok(`${iban.length} Zeichen, wie für ${land.name} vorgesehen.`, details);
      const n = Math.abs(differenz);
      return fehler(
        `${n} Zeichen zu ${differenz > 0 ? "viel" : "wenig"}: ${iban.length} statt ${land.iban_length}.`,
        details,
      );
    },
  },
  {
    id: "pruefziffer",
    titel: "Prüfziffer",
    beschreibung: "Die zwei Ziffern nach dem Ländercode sichern die IBAN gegen Tippfehler (Modulo 97).",
    pruefe(iban) {
      const unzulaessig = [...new Set(iban.replace(/[A-Z0-9]/g, ""))];
      if (unzulaessig.length) {
        return fehler(`Unzulässige Zeichen: ${unzulaessig.join(" ")}. Erlaubt sind nur Buchstaben und Ziffern.`);
      }
      const ziffern = iban.slice(2, 4);
      if (!/^[0-9]{2}$/.test(ziffern)) {
        return fehler(`An Stelle 3 und 4 stehen die Prüfziffern, dort steht „${ziffern}“.`);
      }
      const umgestellt = iban.slice(4) + iban.slice(0, 4);
      const rest = mod97(umgestellt);
      const details = [
        ["Prüfziffern", ziffern],
        ["Umgestellt", umgestellt],
        ["Rest bei Division durch 97", String(rest)],
      ];
      if (rest !== 1) return fehler(`Die Prüfziffern ${ziffern} passen nicht zum Rest der IBAN.`, details);
      // 00, 01 und 99 erfüllen die Rechnung, entstehen aber nie regulär (Spezifikation, Abschnitt 4)
      if (ziffern < "02" || ziffern > "98") {
        return fehler(`Die Prüfziffern ${ziffern} liegen außerhalb des zulässigen Bereichs 02–98.`, details);
      }
      return ok(`Die Prüfziffern ${ziffern} stimmen.`, details);
    },
  },
  {
    id: "struktur",
    titel: "Struktur",
    beschreibung: "Jedes Land legt fest, an welchen Stellen Ziffern oder Buchstaben stehen.",
    pruefe(iban, land) {
      const abschnitte = zerlege(land.bban_structure, iban);
      const details = [
        ["Format", land.iban_structure],
        ...abschnitte.map((a) => [
          `${stellen(a)}: ${a.laenge} ${a.klasse.name}`,
          a.passt ? a.text : `${a.text} (passt nicht)`,
        ]),
      ];
      const falsch = abschnitte.filter((a) => !a.passt);
      if (!falsch.length) return ok(`Der Aufbau entspricht dem Format für ${land.name}.`, details);
      const a = falsch[0];
      const weitere = falsch.length > 1 ? ` Insgesamt passen ${falsch.length} Abschnitte nicht.` : "";
      return fehler(
        `${stellen(a)}: Erwartet ${a.laenge === 1 ? "wird" : "werden"} ${a.laenge} ${a.klasse.name}, dort steht „${a.text}“.${weitere}`,
        details,
      );
    },
  },
];

// Zeichenklassen der Registry-Notation (Spezifikation, Abschnitt 3)
const KLASSEN = {
  n: { name: "Ziffern", muster: /^[0-9]+$/ },
  a: { name: "Buchstaben", muster: /^[A-Z]+$/ },
  c: { name: "Buchstaben oder Ziffern", muster: /^[A-Z0-9]+$/ },
};

const stellen = (a) => (a.laenge === 1 ? `Stelle ${a.von}` : `Stellen ${a.von}–${a.bis}`);

/** Teilt die BBAN der IBAN nach der Strukturangabe (z. B. "8!n10!n") in Abschnitte. */
function zerlege(struktur, iban) {
  let position = 4; // hinter Ländercode und Prüfziffern
  return [...struktur.matchAll(/(\d+)!([nac])/g)].map(([, anzahl, art]) => {
    const laenge = Number(anzahl);
    const text = iban.slice(position, position + laenge);
    const abschnitt = {
      von: position + 1,
      bis: position + laenge,
      laenge,
      klasse: KLASSEN[art],
      text,
      passt: KLASSEN[art].muster.test(text),
    };
    position += laenge;
    return abschnitt;
  });
}

/**
 * Liest Bankleitzahl und, falls das Land eine ausweist, die Filialkennung aus
 * der IBAN. Die Positionen der Registry beziehen sich auf die BBAN (ab Stelle 5).
 */
export function bankdaten(iban, land) {
  const teil = (bereich) => (bereich ? iban.slice(4 + bereich[0], 4 + bereich[1]) : null);
  return { bankleitzahl: teil(land.bank_code), filiale: teil(land.branch_code) };
}

/**
 * Führt die Schritte der Reihe nach aus. Nach dem ersten Fehler werden die
 * folgenden Schritte nicht mehr ausgeführt (Status "offen").
 */
export function pruefeIban(eingabe, registry) {
  const iban = normalisiere(eingabe);
  const land = registry[iban.slice(0, 2)];
  let weiter = iban.length > 0;
  const schritte = SCHRITTE.map((schritt) => {
    const kopf = { id: schritt.id, titel: schritt.titel, beschreibung: schritt.beschreibung };
    if (!weiter) return { ...kopf, status: "offen", meldung: "", details: [] };
    const ergebnis = schritt.pruefe(iban, land);
    weiter = ergebnis.status === "ok";
    return { ...kopf, ...ergebnis };
  });
  return {
    iban,
    land,
    schritte,
    leer: iban.length === 0,
    gueltig: weiter,
    // Bankdaten nur aus einer vollständig geprüften IBAN lesen
    bank: weiter ? bankdaten(iban, land) : null,
  };
}
