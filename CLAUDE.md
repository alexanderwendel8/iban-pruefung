# iban-pruefung

Grundlage für alle Arbeiten an der IBAN-Prüfung:

- `docs/iban-spezifikation.md` – Aufbau, Notation, Prüfalgorithmus (MOD 97-10), Grenzen, Datenherkunft. Zuerst lesen.
- `spec/iban-registry.json` – Länge, Struktur, Regex und Feldpositionen je IBAN-Präfix. Länderdaten nicht aus dem Gedächtnis ergänzen, sondern hieraus lesen.
- `spec/test-vectors.json` – gültige und ungültige IBANs; jede Implementierung muss sie bestehen.
- `python3 scripts/build_registry.py` – aktualisiert die Registry-Datei und prüft die Testvektoren (nur Standardbibliothek).
