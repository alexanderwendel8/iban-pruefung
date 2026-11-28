# iban-pruefung

Prüft IBANs nach ISO 13616 Schritt für Schritt, als statische Seite für GitHub Pages.

- [Weboberfläche](index.html) – Schritte bisher: Länge, Prüfziffer, Struktur, Bank (für die Länder des [BIC-Verzeichnisses](https://github.com/alexanderwendel8/bic-verzeichnis))
- [IBAN-Spezifikation](docs/iban-spezifikation.md)
- [Länderformate (JSON)](spec/iban-registry.json), erzeugt aus der [SWIFT IBAN Registry](spec/sources/iban-registry.txt)
- [Testvektoren (JSON)](spec/test-vectors.json)

Lokal starten: `python3 -m http.server`, dann <http://localhost:8000>.
Tests: `node --test web/*.test.mjs` und `python3 scripts/build_registry.py`.

GitHub Pages: unter Settings → Pages „Deploy from a branch“ wählen, Ordner `/ (root)`.
