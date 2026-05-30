#!/usr/bin/env python3
"""Import Stylbiella SS26 product info Excel into supplier catalog JSON."""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import openpyxl
except ImportError as exc:
    raise SystemExit("Install openpyxl: pip3 install openpyxl") from exc

DEFAULT_XLSX = Path.home() / "Downloads/Stylbiella SS26 Product info.xlsx"
OUT_PATH = Path("src/data/suppliers/stylbiella-ss26.json")


def clean(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def parse_features(raw) -> dict:
    text = clean(raw)
    if not text:
        return {"composition": None, "weight_gsm": None, "width_cm": None, "quality": None}

    weight_match = re.search(r"(\d+)\s*GR\b", text, re.I)
    width_match = re.search(r"(\d+)\s*CM\b", text, re.I)
    composition_part = re.sub(r"-?\d+\s*GR\b.*$", "", text, flags=re.I)
    composition_part = re.sub(r"-?\d+\s*CM\b.*$", "", composition_part, flags=re.I).strip()

    quality = None
    quality_match = re.match(
        r"^(SUPER\d+'?S?|HIGH TWIST|HIGHT TWIST|TROPICAL|SOLBI\s*AIR|CASHCO|CROSS[- ]PLY)",
        composition_part,
        re.I,
    )
    if quality_match:
        quality = re.sub(r"\s+", " ", quality_match.group(1)).strip()
        composition_part = composition_part[quality_match.end() :].lstrip("- ").strip()

    composition_part = re.sub(r"(\d+%)([A-Za-z])", r"\1 \2", composition_part)
    composition_part = re.sub(r"([A-Za-z])(\d+%)", r"\1 \2", composition_part)
    composition_part = re.sub(r"\s+", " ", composition_part).strip()

    return {
        "composition": composition_part or quality or text,
        "weight_gsm": int(weight_match.group(1)) if weight_match else None,
        "width_cm": int(width_match.group(1)) if width_match else None,
        "quality": quality,
    }


def build_description(**parts) -> str:
    return " — ".join(value for value in parts.values() if value)


def import_workbook(xlsx_path: Path) -> list[dict]:
    fabrics: list[dict] = []
    seen: set[str] = set()

    def add(entry: dict) -> None:
        fabric_number = entry["fabric_number"]
        if not fabric_number or fabric_number in seen:
            return
        seen.add(fabric_number)
        fabrics.append(entry)

    workbook = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)

    lookbooks = workbook["Lookbooks"]
    for row in lookbooks.iter_rows(min_row=5, values_only=True):
        book_number, book_name, _, garments = row[0], clean(row[1]), row[2], clean(row[3])
        suit_code, suit_features, suit_comment, suit_pattern, suit_color = (
            clean(row[4]),
            row[5],
            clean(row[6]),
            clean(row[7]),
            clean(row[8]),
        )
        shirt_code, shirt_features = clean(row[9]), row[10]

        if suit_code:
            parsed = parse_features(suit_features)
            add(
                {
                    "fabric_number": suit_code,
                    "book_number": str(book_number) if book_number is not None else None,
                    "collection": book_name,
                    "composition": parsed["composition"],
                    "color": suit_color,
                    "description": build_description(
                        book=book_name,
                        category=garments,
                        quality=parsed["quality"],
                        pattern=suit_pattern,
                        color=suit_color,
                        comment=suit_comment,
                    ),
                    "weight_gsm": parsed["weight_gsm"],
                    "width_cm": parsed["width_cm"],
                    "unit_price": None,
                    "unit": "meters",
                    "currency": "EUR",
                    "is_active": True,
                    "category": (garments or "suiting").lower(),
                }
            )

        if shirt_code:
            parsed = parse_features(shirt_features)
            add(
                {
                    "fabric_number": shirt_code,
                    "book_number": str(book_number) if book_number is not None else None,
                    "collection": book_name,
                    "composition": parsed["composition"],
                    "color": None,
                    "description": build_description(
                        book=book_name,
                        category="SHIRTS",
                        quality=parsed["quality"],
                    ),
                    "weight_gsm": parsed["weight_gsm"],
                    "width_cm": parsed["width_cm"],
                    "unit_price": None,
                    "unit": "meters",
                    "currency": "EUR",
                    "is_active": True,
                    "category": "shirts",
                }
            )

    bunches = workbook["Bunches"]
    for row in bunches.iter_rows(min_row=3, values_only=True):
        bunch_number, _, bunch_name, code, features, comment, pattern = row
        code = clean(code)
        if not code:
            continue
        parsed = parse_features(features)
        add(
            {
                "fabric_number": code,
                "book_number": str(bunch_number) if bunch_number is not None else None,
                "collection": clean(bunch_name),
                "composition": parsed["composition"],
                "color": None,
                "description": build_description(
                    book=clean(bunch_name),
                    category="BUNCH",
                    quality=parsed["quality"],
                    pattern=clean(pattern),
                    comment=clean(comment),
                ),
                "weight_gsm": parsed["weight_gsm"],
                "width_cm": parsed["width_cm"],
                "unit_price": None,
                "unit": "meters",
                "currency": "EUR",
                "is_active": True,
                "category": "bunch",
            }
        )

    fabrics.sort(key=lambda fabric: fabric["fabric_number"])
    return fabrics


def main() -> None:
    xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx_path.exists():
        raise SystemExit(f"File not found: {xlsx_path}")

    fabrics = import_workbook(xlsx_path)
    payload = {
        "document_type": "price_list",
        "supplier": {
            "code": "STYLBIELLA",
            "name": "Stylbiella",
            "country": "Italy",
            "is_fabric_supplier": True,
            "lead_time_days": 14,
            "currency": "EUR",
        },
        "price_list_name": "SS26 Product Info",
        "imported_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source_file": xlsx_path.name,
        "fabric_count": len(fabrics),
        "fabrics": fabrics,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"✓ Stylbiella SS26: {len(fabrics)} fabrics → {OUT_PATH}")


if __name__ == "__main__":
    main()
