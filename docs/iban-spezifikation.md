# IBAN-Spezifikation (ISO 13616)

Arbeitsfassung der Regeln, nach denen eine IBAN aufgebaut ist und geprüft wird.
Die länderspezifischen Daten stehen maschinenlesbar in
[`spec/iban-registry.json`](../spec/iban-registry.json), Testfälle in
[`spec/test-vectors.json`](../spec/test-vectors.json).

## 1. Normen und Zuständigkeiten

| Dokument | Inhalt |
|---|---|
| ISO 13616-1 | Aufbau der IBAN |
| ISO 13616-2 | Rolle der Registrierungsstelle (SWIFT) und Registrierungsverfahren |
| SWIFT IBAN Registry | Verbindliche Liste der nationalen IBAN-Formate; wird laufend fortgeschrieben |
| ISO/IEC 7064 | Prüfziffernverfahren MOD 97-10 |
| ISO 3166-1 | Ländercodes (alpha-2) |

Die ISO-Normen sind kostenpflichtig; die für die Prüfung nötigen Länderformate
veröffentlicht SWIFT frei in der Registry.

## 2. Aufbau

```
DE 89 370400440532013000
│  │  └─ BBAN (Basic Bank Account Number), national festgelegt, max. 30 Zeichen
│  └──── 2 Prüfziffern
└─────── 2 Buchstaben Ländercode (ISO 3166-1 alpha-2)
```

- Gesamtlänge höchstens 34 Zeichen; **je Land fest** (derzeit 15 bis 33).
- Die BBAN hat je Land eine feste Länge und enthält an fester Position eine
  Bankkennung (ggf. zusätzlich eine Filialkennung), danach die Kontonummer.
- Zulässige Zeichen: Ziffern `0–9` und Buchstaben `A–Z`.

### Darstellungsformen

| Form | Regel | Beispiel |
|---|---|---|
| elektronisch | ohne Trennzeichen | `DE89370400440532013000` |
| Papier | Vierergruppen mit Leerzeichen, letzte Gruppe ggf. kürzer | `DE89 3704 0044 0532 0130 00` |

Vor der Prüfung wird in die elektronische Form überführt: Leerzeichen entfernen,
in Großbuchstaben wandeln. Ein vorangestelltes `IBAN ` gehört nicht zur IBAN.

## 3. Strukturnotation der Registry

Die Registry beschreibt Formate als Folge von `Länge` + `Zeichenklasse`:

| Zeichen | Bedeutung | Regex |
|---|---|---|
| `n` | Ziffern | `[0-9]` |
| `a` | Großbuchstaben | `[A-Z]` |
| `c` | alphanumerisch (Groß-/Kleinbuchstaben, Ziffern) | `[A-Za-z0-9]` |
| `e` | Leerzeichen | ` ` |
| `nn!` | genau `nn` Zeichen (feste Länge) | `{nn}` |
| `nn` | höchstens `nn` Zeichen | `{1,nn}` |

Beispiel: `DE2!n8!n10!n` = `DE`, 2 Prüfziffern, 8 Ziffern Bankleitzahl,
10 Ziffern Kontonummer → 22 Zeichen. Alle aktuell registrierten Formate
verwenden ausschließlich feste Längen und nur `n`, `a`, `c`.

## 4. Prüfalgorithmus

Eine IBAN ist formal gültig, wenn alle Schritte bestehen:

1. **Normalisieren**: Leerzeichen entfernen, Großbuchstaben. Andere Zeichen als
   `A–Z`, `0–9` → ungültig.
2. **Land**: Die ersten zwei Zeichen müssen ein Präfix aus der Registry sein.
3. **Länge**: muss exakt `iban_length` des Landes entsprechen.
4. **Struktur**: muss auf `iban_regex` des Landes passen.
5. **Prüfsumme (MOD 97-10)**:
   1. Die ersten vier Zeichen ans Ende stellen.
   2. Jeden Buchstaben durch zwei Ziffern ersetzen: `A=10, B=11, …, Z=35`.
   3. Die entstehende Dezimalzahl modulo 97 muss **1** ergeben.

Beispiel `GB82 WEST 1234 5698 7654 32`:

```
umgestellt:  WEST12345698765432GB82
numerisch:   3214282912345698765432161182
mod 97:      1  → gültig
```

### Rechnen ohne Langzahlarithmetik

Die Zahl hat bis zu 68 Stellen. Stückweise rechnen: Rest mit den nächsten
(höchstens 7) Ziffern verketten, modulo 97 nehmen, wiederholen. Oder
zeichenweise: `rest = (rest * 10 + ziffer) % 97` bzw. für Buchstaben
`rest = (rest * 100 + wert) % 97`.

### Prüfziffern berechnen

1. Prüfziffern auf `00` setzen, also `<Land>00<BBAN>`.
2. Umstellen und in Ziffern wandeln wie oben, `r = Zahl mod 97`.
3. Prüfziffern = `98 − r`, zweistellig mit führender Null.

Daraus folgt, dass korrekt erzeugte Prüfziffern immer im Bereich **02–98**
liegen. `00`, `01` und `99` können die Mod-97-Bedingung rechnerisch erfüllen
(sie sind kongruent zu `97`, `98`, `02`), entstehen aber nie regulär. Eine
strenge Prüfung lehnt sie ab.

## 5. Was die IBAN-Prüfung nicht leistet

- **Keine Existenzprüfung**: Eine formal gültige IBAN sagt nichts darüber, ob
  Bank oder Konto existieren.
- **Nationale Prüfziffern** innerhalb der BBAN (z. B. die kontonummernbezogenen
  Verfahren der deutschen Banken, der spanische Kontrollcode, die RIB-Schlüssel
  in Frankreich) sind nicht Teil von ISO 13616 und brauchen eigene Regeln.
- **Bankkennung gültig?** Erfordert nationale Bankverzeichnisse.
- MOD 97-10 erkennt jeden Einzelzeichenfehler und nahezu alle Vertauschungen
  benachbarter Zeichen, aber nicht jede beliebige Mehrfachänderung.

## 6. Länderdaten (`spec/iban-registry.json`)

Erzeugt aus der Originaldatei der SWIFT IBAN Registry. Schlüssel unter
`countries` ist das IBAN-Präfix (89 Einträge). Felder:

| Feld | Bedeutung |
|---|---|
| `name` | Ländername laut Registry (englisch) |
| `iban_length`, `bban_length` | Längen in Zeichen |
| `iban_structure`, `bban_structure` | Format in Registry-Notation |
| `iban_regex`, `bban_regex` | daraus abgeleitete Regex (ohne Anker; mit `fullmatch` bzw. `^…$` verwenden) |
| `bank_code`, `branch_code` | Position in der BBAN als `[start, ende)`, 0-basiert; `null`, wenn nicht ausgewiesen |
| `account_code` | abgeleitet: alles hinter Bank- und Filialkennung |
| `sepa` | Land nimmt am SEPA-Raum teil |
| `sepa_also_includes` | Gebiete, die laut Registry zusätzlich zum SEPA-Raum zählen (Freitext) |
| `includes_territories` | Ländercodes der Gebiete, die das Präfix laut Registry mit umfasst |
| `example_iban`, `example_iban_print` | offizielles Beispiel, elektronisch und in Papierform |
| `effective_date`, `last_update` | Angaben der Registry zum Eintrag (`Mon-JJ`) |

Hinweise zur Auslegung:

- Die Registry zählt Positionen 1-basiert und inklusiv (`5-8`); die JSON-Datei
  rechnet in 0-basierte, halboffene Bereiche um (`[4, 8]`).
- `c` erlaubt in der Notation Kleinbuchstaben. Da vor der Prüfung in
  Großbuchstaben gewandelt wird, spielt das praktisch keine Rolle.
- `account_code` kann nationale Prüfziffern oder Kontoartkennzeichen enthalten.
- **Gebiete** (`AX` unter `FI`; `IM`, `JE`, `GG` unter `GB`; die französischen
  Überseegebiete unter `FR`): Die Registry führt sie nur in der Zeile „Country
  code includes other countries/territories“ und nennt keine eigenen Formate.
  Ihre IBANs beginnen mit dem Präfix des Mutterlands; Gebietscodes sind hier
  **keine** gültigen IBAN-Präfixe (`GF…` wird abgelehnt). Manche Bibliotheken
  sind großzügiger.
- Die Papierform-Beispiele der Registry weichen teils von den Vierergruppen ab
  (z. B. `BI`, `LY`, `SV`). Maßgeblich bleibt die Regel aus Abschnitt 2; ohne
  Leerzeichen stimmen alle mit dem elektronischen Beispiel überein.
- Länder, die IBAN-ähnliche Formate nutzen, aber nicht in der SWIFT-Registry
  stehen, sind nicht enthalten.

## 7. Herkunft und Aktualität der Daten

- Quelle: [`spec/sources/iban-registry.txt`](../spec/sources/iban-registry.txt),
  die „IBAN Registry (TXT)“ von
  <https://www.swift.com/standards/data-standards/iban-international-bank-account-number>,
  unverändert abgelegt (Windows-1252, tabulatorgetrennt, ein Land je Spalte).
  Die Prüfsumme der verwendeten Datei steht als `source_sha256` in der JSON-Datei.
- Stand: in die Sitzung hochgeladen am 26.11.2026. Die Datei selbst nennt keine
  Release-Nummer; die jüngsten Einträge sind von September 2026 (`BR`,
  wirksam ab August 2026 mit alphanumerischer Bankkennung `8!c5!n10!n1!c1!c`).
- `swift.com` weist automatisierte Abrufe ab (HTTP 403); die Datei muss von Hand
  geladen werden.
- Aktualisieren: neue TXT-Datei über die alte legen, dann
  `python3 scripts/build_registry.py`. Das Skript prüft die Konsistenz von
  Struktur- und Längenangaben, erzeugt beide JSON-Dateien neu und prüft die
  Testvektoren.

## 8. Testvektoren (`spec/test-vectors.json`)

- `valid`: die 89 offiziellen Beispiel-IBANs der Registry (elektronisches
  Format). Alle bestehen Struktur- und Prüfsummenprüfung dieser Spezifikation.
- `invalid`: Fälle, die abgelehnt werden müssen, jeweils mit Grund (von Hand
  gepflegt, das Skript lässt sie unverändert).
