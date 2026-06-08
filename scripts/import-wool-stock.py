#!/usr/bin/env python3
"""Import HAGAN wool warehouse stock from Wool Stock .xlsx."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from openpyxl import load_workbook
except ImportError:
    print("openpyxl is required: pip install openpyxl", file=sys.stderr)
    raise

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = Path.home() / "Desktop" / "Fabrics" / "Wool Stock" / "Wool Stock .xlsx"
OUT_PATH = ROOT / "src" / "data" / "suppliers" / "wool-stock.json"


def parse_weight(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"[\d.]+", str(value))
    return float(match.group(0)) if match else None


def is_valid_reference(value) -> bool:
    if value is None:
        return False
    text = str(value).strip()
    return bool(text) and text.lower() not in {"reference", "total"}


def parse_sheet(xlsx_path: Path) -> list[dict]:
    wb = load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb["All References"]
    fabrics: list[dict] = []
    seen: set[str] = set()

    for row in ws.iter_rows(min_row=2, values_only=True):
        reference, quality_no, composition, weight = (row + (None, None, None, None))[:4]
        if not is_valid_reference(reference):
            continue
        fabric_number = str(reference).strip()
        key = fabric_number.lower()
        if key in seen:
            continue
        seen.add(key)

        weight_gsm = parse_weight(weight)
        quality = str(quality_no).strip() if quality_no else None
        comp = str(composition).strip() if composition else None
        weight_label = f"{int(weight_gsm)} g/m" if weight_gsm else "spec pending"

        description_parts = ["Wool stock"]
        if quality:
            description_parts.append(f"quality {quality}")
        description_parts.append(f"({weight_label})")

        fabrics.append(
            {
                "fabric_number": fabric_number,
                "composition": comp,
                "color": None,
                "description": " — ".join(description_parts[:2]) + f" ({weight_label})",
                "weight_gsm": weight_gsm,
                "width_cm": None,
                "collection": "HAGAN Wool Stock",
                "category": quality,
                "unit_price": None,
                "unit": "meters",
                "currency": "EUR",
                "is_active": True,
                "stock_status": "in_stock",
                "available_meters": None,
            }
        )

    wb.close()
    fabrics.sort(key=lambda item: item["fabric_number"].lower())
    return fabrics


def main() -> None:
    xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx_path.exists():
        print(f"File not found: {xlsx_path}", file=sys.stderr)
        sys.exit(1)

    fabrics = parse_sheet(xlsx_path)
    payload = {
        "document_type": "warehouse_stock",
        "supplier": {
            "code": "WOOL-STOCK",
            "name": "Wool Stock",
            "country": None,
            "is_fabric_supplier": True,
            "lead_time_days": 0,
            "currency": "EUR",
        },
        "price_list_name": "HAGAN Wool Stock",
        "imported_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source_file": xlsx_path.name,
        "fabric_count": len(fabrics),
        "fabrics": fabrics,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wool stock: {len(fabrics)} fabrics -> {OUT_PATH}")


if __name__ == "__main__":
    main()
