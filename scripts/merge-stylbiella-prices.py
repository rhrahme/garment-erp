#!/usr/bin/env python3
"""Merge Stylbiella USD prices from the SS26 price PDF into product-info catalogs."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

PDF_PATH = Path.home() / "Desktop/Fabrics/Stylbiella/Stylbiella - SS26 pricelist USD CLF.pdf"
NODE = "/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node"

CATALOGS: list[tuple[Path, str]] = [
    (Path("src/data/suppliers/stylbiella-aw25.json"), "AW25"),
    (Path("src/data/suppliers/stylbiella-ss25.json"), "SS25"),
    (Path("src/data/suppliers/stylbiella-ss26.json"), "SS26"),
]


def extract_pdf_text(pdf_path: Path) -> str:
    script = f"""
import fs from 'fs';
import {{ PDFParse }} from 'pdf-parse';
const buf = new Uint8Array(fs.readFileSync({json.dumps(str(pdf_path))}));
const parser = new PDFParse(buf);
const result = await parser.getText();
process.stdout.write(result.text);
"""
    result = subprocess.run(
        [NODE, "--input-type=module", "-e", script],
        cwd=Path(__file__).resolve().parents[1],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


def parse_price_map(text: str) -> dict[str, float]:
    price_map: dict[str, float] = {}
    for match in re.finditer(r"(\d{3}(?:/\d{3})*)\s+([\d.]+)", text):
        price = float(match.group(2))
        for code in match.group(1).split("/"):
            price_map[code] = price
    return price_map


def price_code_for_fabric(fabric_number: str) -> str | None:
    if "/" not in fabric_number:
        return None
    return fabric_number.rsplit("/", 1)[-1]


def merge_prices(
    catalog: dict,
    price_map: dict[str, float],
    *,
    season: str,
    pdf_name: str,
    require_all: bool,
) -> dict:
    matched = 0
    unmatched: list[str] = []

    for fabric in catalog["fabrics"]:
        code = price_code_for_fabric(fabric["fabric_number"])
        price = price_map.get(code) if code else None
        if price is None:
            unmatched.append(fabric["fabric_number"])
            continue
        fabric["unit_price"] = price
        fabric["currency"] = "USD"
        fabric["is_active"] = True
        matched += 1

    catalog["supplier"]["currency"] = "USD"
    source = catalog.get("source_file", f"Stylbiella {season} Product info.xlsx")
    if pdf_name not in source:
        source = f"{source} + {pdf_name} (SS26 price codes)"
    catalog["source_file"] = source
    catalog["price_list_name"] = f"{season} Product Info + SS26 USD Prices"
    catalog["imported_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    if require_all and unmatched:
        raise SystemExit(f"{season}: unmatched fabrics ({len(unmatched)}): {unmatched[:10]}")

    print(f"{season}: matched {matched}/{len(catalog['fabrics'])} fabrics")
    if unmatched:
        print(f"{season}: left without price ({len(unmatched)})")
    return catalog


def main() -> None:
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else PDF_PATH
    if not pdf_path.exists():
        raise SystemExit(f"File not found: {pdf_path}")

    text = extract_pdf_text(pdf_path)
    price_map = parse_price_map(text)
    if not price_map:
        raise SystemExit("No price codes parsed from PDF")

    for catalog_path, season in CATALOGS:
        if not catalog_path.exists():
            print(f"Skipping missing catalog: {catalog_path}")
            continue
        catalog = json.loads(catalog_path.read_text())
        catalog = merge_prices(
            catalog,
            price_map,
            season=season,
            pdf_name=pdf_path.name,
            require_all=season == "SS26",
        )
        catalog_path.write_text(json.dumps(catalog, indent=2) + "\n")
        print(f"✓ Updated {catalog_path}")

    print(f"Applied {len(price_map)} SS26 price codes from {pdf_path.name}")


if __name__ == "__main__":
    main()
