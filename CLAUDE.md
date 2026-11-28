# iban-pruefung

Grundlage für alle Arbeiten an der IBAN-Prüfung:

- `docs/iban-spezifikation.md` – Aufbau, Notation, Prüfalgorithmus (MOD 97-10), Grenzen, Datenherkunft. Zuerst lesen.
- `spec/iban-registry.json` – Länge, Struktur, Regex und Feldpositionen je IBAN-Präfix. Länderdaten nicht aus dem Gedächtnis ergänzen, sondern hieraus lesen.
- `spec/test-vectors.json` – gültige und ungültige IBANs; jede Implementierung muss sie bestehen.
- `spec/test-ibans.json` – die IBANs, mit denen die Weboberfläche von Hand durchgespielt wurde, mit erwartetem Ergebnis; enthält auch Fälle für den Schritt „Bank“ (Stand der Bankdaten steht in der Datei). Von Hand gepflegt; neue Browser-Testfälle hier ergänzen.
- `spec/sources/iban-registry.txt` – Originaldatei der SWIFT IBAN Registry (Windows-1252, nicht umkodieren oder von Hand ändern).
- `python3 scripts/build_registry.py` – erzeugt beide JSON-Dateien aus der Originaldatei und prüft die Testvektoren (nur Standardbibliothek). JSON-Dateien nicht von Hand ändern, außer `invalid` in den Testvektoren.

Weboberfläche (statisch, für GitHub Pages aus dem Repo-Wurzelverzeichnis, ohne Build):

- `index.html`, `web/app.js`, `web/style.css` – Oberfläche; lädt `spec/iban-registry.json` zur Laufzeit.
- `web/pruefung.js` – Prüflogik ohne DOM. Die Prüfung läuft als Liste `SCHRITTE` der Reihe nach; ein neuer Prüfschritt ist ein weiterer Eintrag dort, die Oberfläche zeigt ihn automatisch an.
- `web/bank.js` – vierter Prüfschritt „Bank“: schlägt die Bankleitzahl im BIC-Verzeichnis nach (API von `alexanderwendel8/bic-verzeichnis`; welche Länder es gibt, sagt deren `index.json`, derzeit 13). Schlüssel ist die Bankkennung aus der Registry, nur in Ungarn der achtstellige Filialcode (`bankschluessel`). Die API verlangt sichtbare Quellenangaben: Wortlaut und Links kommen aus `laender.json` der Verzeichnis-Webseite und stehen beim Ergebnis, für BICs aus IT, ES, FR zusätzlich der SWIFT-Hinweis. Unbekannte oder entfernte Bankleitzahl macht die IBAN ungültig; für Länder ohne Verzeichnis entfällt der Schritt. Er läuft asynchron in `web/app.js` nach den Schritten aus `pruefung.js`. Nur Land und Bankleitzahl gehen ins Netz, nie die ganze IBAN.
- `spec/test-vectors.json` gilt für die Formatprüfung (`pruefung.js`); manche offiziellen Beispiel-IBANs (z. B. Österreich) bestehen sie, scheitern aber am Schritt „Bank“, weil ihre Bankleitzahl erfunden ist.
- `node --test web/*.test.mjs` – prüft die Logik gegen `spec/test-vectors.json` und die Bankabfrage ohne Netz.
- Lokal ansehen: `python3 -m http.server` im Wurzelverzeichnis (Module und `fetch` brauchen HTTP, `file://` reicht nicht).
