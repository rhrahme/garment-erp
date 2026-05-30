#!/usr/bin/env python3
"""Merge Stylbiella SS26 USD prices from PDF into the product-info catalog."""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

CATALOG_PATH = Path("src/data/suppliers/stylbiella-ss26.json")
DEFAULT_PDF = Path.home() / "Desktop/Fabrics/Stylbiella/Stylbiella - SS26 pricelist USD CLF.pdf"
NODE = "/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node"


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


def merge_prices(catalog: dict, price_map: dict[str, float], source_file: str) -> dict:
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
    catalog["price_list_name"] = "SS26 Product Info + USD Prices"
    catalog["source_file"] = f"{catalog.get('source_file', 'Stylbiella SS26 Product info.xlsx')} + {source_file}"
    catalog["imported_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    if unmatched:
        raise SystemExit(f"Unmatched fabrics ({len(unmatched)}): {unmatched[:10]}")

    print(f"Matched {matched}/{len(catalog['fabrics'])} fabrics")
    return catalog


def main() -> None:
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    if not pdf_path.exists():
        raise SystemExit(f"File not found: {pdf_path}")
    if not CATALOG_PATH.exists():
        raise SystemExit(f"Catalog not found: {CATALOG_PATH} — run import-stylbiella-xlsx.py first")

    text = extract_pdf_text(pdf_path)
    price_map = parse_price_map(text)
    if not price_map:
        raise SystemExit("No price codes parsed from PDF")

    catalog = json.loads(CATALOG_PATH.read_text())
    catalog = merge_prices(catalog, price_map, pdf_path.name)
    CATALOG_PATH.write_text(json.dumps(catalog, indent=2) + "\n")
    print(f"✓ Updated {CATALOG_PATH} with {len(price_map)} price codes from {pdf_path.name}")


if __name__ == "__main__":
    main()
