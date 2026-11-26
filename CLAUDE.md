# iban-pruefung

Grundlage für alle Arbeiten an der IBAN-Prüfung:

- `docs/iban-spezifikation.md` – Aufbau, Notation, Prüfalgorithmus (MOD 97-10), Grenzen, Datenherkunft. Zuerst lesen.
- `spec/iban-registry.json` – Länge, Struktur, Regex und Feldpositionen je IBAN-Präfix. Länderdaten nicht aus dem Gedächtnis ergänzen, sondern hieraus lesen.
- `spec/test-vectors.json` – gültige und ungültige IBANs; jede Implementierung muss sie bestehen.
- `spec/sources/iban-registry.txt` – Originaldatei der SWIFT IBAN Registry (Windows-1252, nicht umkodieren oder von Hand ändern).
- `python3 scripts/build_registry.py` – erzeugt beide JSON-Dateien aus der Originaldatei und prüft die Testvektoren (nur Standardbibliothek). JSON-Dateien nicht von Hand ändern, außer `invalid` in den Testvektoren.

Weboberfläche (statisch, für GitHub Pages aus dem Repo-Wurzelverzeichnis, ohne Build):

- `index.html`, `web/app.js`, `web/style.css` – Oberfläche; lädt `spec/iban-registry.json` zur Laufzeit.
- `web/pruefung.js` – Prüflogik ohne DOM. Die Prüfung läuft als Liste `SCHRITTE` der Reihe nach; ein neuer Prüfschritt ist ein weiterer Eintrag dort, die Oberfläche zeigt ihn automatisch an.
- `node --test web/pruefung.test.mjs` – prüft die Logik gegen `spec/test-vectors.json`.
- Lokal ansehen: `python3 -m http.server` im Wurzelverzeichnis (Module und `fetch` brauchen HTTP, `file://` reicht nicht).
