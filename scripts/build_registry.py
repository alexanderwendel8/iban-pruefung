#!/usr/bin/env python3
"""Erzeugt spec/iban-registry.json und prüft spec/test-vectors.json.

Quelle der Strukturdaten: die von schwifty wöchentlich aus der offiziellen
SWIFT-IBAN-Registry (TXT) generierte Datei (MIT-Lizenz). swift.com selbst
lehnt automatisierte Abrufe ab, daher der Umweg.

    python3 scripts/build_registry.py            # lädt die Quelle neu
    python3 scripts/build_registry.py datei.json # nutzt eine lokale Kopie

Ländernamen werden aus der bestehenden spec/iban-registry.json übernommen.
"""
import datetime
import json
import re
import sys
import urllib.request
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/mdomke/schwifty/main/schwifty/iban_registry/generated.json"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "spec" / "iban-registry.json"
VECTORS = ROOT / "spec" / "test-vectors.json"
CLASSES = {"n": "[0-9]", "a": "[A-Z]", "c": "[A-Za-z0-9]", "e": " "}
TOKEN = re.compile(r"(\d+)(!?)([nace])")


def spec_to_regex(spec: str) -> str:
    """'8!n10!n' -> '[0-9]{8}[0-9]{10}' (SWIFT-Notation, siehe docs)."""
    if not TOKEN.sub("", spec) == "":
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


def build(raw: dict, names: dict) -> dict:
    countries = {}
    territories = {}
    for cc in sorted(raw):
        r = raw[cc]
        prefix = r["iban_spec"][:2]
        if prefix != cc:
            # Gebiet ohne eigenen Eintrag: laut Registry vom Präfixland "mit umfasst"
            territories.setdefault(prefix, []).append(cc)
            continue
        # Vergleich über die Zeichenfolge, da die Registry teils anders gruppiert (CZ)
        if expand(r["iban_spec"][2:]) != "nn" + expand(r["bban_spec"]):
            raise ValueError(f"{cc}: IBAN- und BBAN-Struktur passen nicht zusammen")
        bban_regex = spec_to_regex(r["bban_spec"])
        if sum(int(n) for n, _, _ in TOKEN.findall(r["bban_spec"])) != r["bban_length"]:
            raise ValueError(f"{cc}: BBAN-Länge inkonsistent")
        if r["iban_length"] != r["bban_length"] + 4:
            raise ValueError(f"{cc}: IBAN-Länge inkonsistent")
        pos = r["positions"]
        countries[cc] = {
            "name": names.get(cc, ""),
            "iban_length": r["iban_length"],
            "iban_structure": r["iban_spec"],
            "iban_regex": f"{prefix}[0-9]{{2}}{bban_regex}",
            "bban_length": r["bban_length"],
            "bban_structure": r["bban_spec"],
            "bban_regex": bban_regex,
            # 0-basierte, halboffene Bereiche [start, ende) innerhalb der BBAN
            "bank_code": pos.get("bank_code"),
            "branch_code": pos.get("branch_code"),
            "account_code": pos.get("account_code"),
            "sepa": r["in_sepa_zone"],
            "includes_territories": [],
        }
    for prefix, codes in territories.items():
        countries[prefix]["includes_territories"] = [
            {"code": cc, "name": names.get(cc, "")} for cc in codes
        ]
    return countries


def main() -> None:
    if len(sys.argv) > 1:
        raw = json.loads(Path(sys.argv[1]).read_text())
    else:
        with urllib.request.urlopen(SOURCE) as resp:
            raw = json.load(resp)
    names = {}
    if OUT.exists():
        names = {k: v["name"] for k, v in json.loads(OUT.read_text())["countries"].items()}
    if len(sys.argv) > 2:  # optionale Namensdatei {"DE": "Germany", ...}
        names.update(json.loads(Path(sys.argv[2]).read_text()))
    countries = build(raw, names)
    doc = {
        "description": "IBAN-Strukturen je Ländercode nach SWIFT IBAN Registry (ISO 13616)",
        "source": SOURCE,
        "retrieved": datetime.date.today().isoformat(),
        "notation": "docs/iban-spezifikation.md",
        "countries": countries,
    }
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"{OUT.relative_to(ROOT)}: {len(countries)} IBAN-Präfixe")
    missing = [cc for cc, c in countries.items() if not c["name"]]
    if missing:
        print("ohne Namen:", missing)
    if VECTORS.exists():
        v = json.loads(VECTORS.read_text())
        bad = [i for i in v["valid"] if not is_valid(i, countries)]
        bad += [i["iban"] for i in v["invalid"] if is_valid(i["iban"], countries)]
        print("Testvektoren:", "OK" if not bad else f"FEHLER {bad}")
        if bad:
            sys.exit(1)


if __name__ == "__main__":
    main()
