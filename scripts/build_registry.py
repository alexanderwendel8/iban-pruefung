#!/usr/bin/env python3
"""Erzeugt spec/iban-registry.json und spec/test-vectors.json (Teil "valid")
aus der offiziellen SWIFT-IBAN-Registry spec/sources/iban-registry.txt.

    python3 scripts/build_registry.py

Aktualisieren: "IBAN Registry (TXT)" von swift.com laden, unverändert nach
spec/sources/iban-registry.txt legen, Skript ausführen. Nur Standardbibliothek.
"""
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "spec" / "sources" / "iban-registry.txt"
OUT = ROOT / "spec" / "iban-registry.json"
VECTORS = ROOT / "spec" / "test-vectors.json"
CLASSES = {"n": "[0-9]", "a": "[A-Z]", "c": "[A-Za-z0-9]", "e": " "}
TOKEN = re.compile(r"(\d+)(!?)([nace])")


def read_source() -> dict:
    """Zeilenbeschriftung -> Liste der Werte je Land (Datei ist spaltenweise)."""
    # Windows-1252, tabulatorgetrennt, Zellen mit Zeilenumbruch in Anführungszeichen
    text = SOURCE.read_bytes().decode("cp1252", errors="replace")
    rows = {}
    for row in csv.reader(text.splitlines(keepends=True), dialect="excel-tab"):
        if row and row[0].strip() and row[0] not in rows:
            rows[row[0].strip()] = [cell.strip() for cell in row[1:]]
    return rows


def spec_to_regex(spec: str) -> str:
    """'8!n10!n' -> '[0-9]{8}[0-9]{10}' (SWIFT-Notation, siehe docs)."""
    if TOKEN.sub("", spec):
        raise ValueError(f"unbekannte Strukturangabe: {spec!r}")
    return "".join(
        f"{CLASSES[t]}{{{n}}}" if fixed else f"{CLASSES[t]}{{1,{n}}}"
        for n, fixed, t in TOKEN.findall(spec)
    )


def expand(spec: str) -> str:
    """'2!n3!a' -> 'nnaaa'; nur für Angaben fester Länge."""
    if TOKEN.sub("", spec) or "!" not in spec:
        raise ValueError(f"unbekannte Strukturangabe: {spec!r}")
    return "".join(t * int(n) for n, _, t in TOKEN.findall(spec))


def parse_range(raw: str):
    """'5-8' (1-basiert, inklusiv) -> [4, 8] (0-basiert, halboffen)."""
    m = re.fullmatch(r"(\d+)\s*-\s*(\d+)", raw)
    return [int(m[1]) - 1, int(m[2])] if m else None


def mod97(iban: str) -> int:
    s = iban[4:] + iban[:4]
    return int("".join(str(int(ch, 36)) for ch in s)) % 97


def is_valid(iban: str, registry: dict) -> bool:
    iban = iban.replace(" ", "").upper()
    entry = registry.get(iban[:2])
    return bool(
        entry
        and re.fullmatch(entry["iban_regex"], iban)
        and "02" <= iban[2:4] <= "98"
        and mod97(iban) == 1
    )


def build(rows: dict) -> dict:
    countries = {}
    for i, cc in enumerate(rows["IBAN prefix country code (ISO 3166)"]):
        get = lambda label: rows[label][i] if i < len(rows[label]) else ""
        iban_spec, bban_spec = get("IBAN structure"), get("BBAN structure")
        iban_len, bban_len = int(get("IBAN length")), int(get("BBAN length"))
        if iban_spec[:2] != cc:
            raise ValueError(f"{cc}: IBAN-Struktur beginnt nicht mit dem Präfix")
        # Vergleich über die Zeichenfolge, da die Registry teils anders gruppiert (CZ)
        if expand(iban_spec[2:]) != "nn" + expand(bban_spec):
            raise ValueError(f"{cc}: IBAN- und BBAN-Struktur passen nicht zusammen")
        if len(expand(bban_spec)) != bban_len or iban_len != bban_len + 4:
            raise ValueError(f"{cc}: Längenangaben inkonsistent")
        bank = parse_range(get("Bank identifier position within the BBAN"))
        branch = parse_range(get("Branch identifier position within the BBAN"))
        bban_regex = spec_to_regex(bban_spec)
        countries[cc] = {
            "name": get("Name of country"),
            "iban_length": iban_len,
            "iban_structure": iban_spec,
            "iban_regex": f"{cc}[0-9]{{2}}{bban_regex}",
            "bban_length": bban_len,
            "bban_structure": bban_spec,
            "bban_regex": bban_regex,
            # 0-basierte, halboffene Bereiche [start, ende) innerhalb der BBAN
            "bank_code": bank,
            "branch_code": branch,
            # abgeleitet: alles hinter Bank- und Filialkennung
            "account_code": [max(r[1] for r in (bank, branch) if r), bban_len],
            "sepa": get("SEPA country").lower() == "yes",
            "sepa_also_includes": na(get("SEPA country also includes")),
            "includes_territories": re.findall(
                r"\b[A-Z]{2}\b", na(get("Country code includes other countries/territories")) or ""
            ),
            "example_iban": get("IBAN electronic format example"),
            "example_iban_print": get("IBAN print format example"),
            "effective_date": get("Effective date"),
            "last_update": get("Last update date"),
        }
    return dict(sorted(countries.items()))


def na(value: str):
    return None if value in ("", "N/A") else value


def main() -> None:
    countries = build(read_source())
    doc = {
        "description": "IBAN-Formate je IBAN-Präfix aus der SWIFT IBAN Registry (ISO 13616)",
        "source": str(SOURCE.relative_to(ROOT)),
        "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "documentation": "docs/iban-spezifikation.md",
        "countries": countries,
    }
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {len(countries)} IBAN-Präfixe")

    vectors = json.loads(VECTORS.read_text())
    vectors["valid"] = [c["example_iban"] for c in countries.values()]
    VECTORS.write_text(json.dumps(vectors, indent=2, ensure_ascii=False) + "\n")
    bad = [i for i in vectors["valid"] if not is_valid(i, countries)]
    bad += [
        c["example_iban_print"]
        for c in countries.values()
        if c["example_iban_print"].replace(" ", "") != c["example_iban"]
    ]
    bad += [i["iban"] for i in vectors["invalid"] if is_valid(i["iban"], countries)]
    print("Testvektoren:", "OK" if not bad else f"FEHLER {bad}")
    if bad:
        sys.exit(1)


if __name__ == "__main__":
    main()
