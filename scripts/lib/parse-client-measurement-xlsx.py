#!/usr/bin/env python3
"""Parse FR client measurement Excel sheets into JSON (stdout).

Maps Size / Sample column -> base_value + target_value.
Maps Trial - N columns -> trial_values[N].
Maps Final column -> final_value.
Also extracts pattern_ref, fabric code, description, unit hint, special instructions.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from openpyxl import load_workbook


def clean(value) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def to_number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = clean(value).replace(",", ".")
    if (not text) or text in {"-", "n/a", "na"} or (len(text) == 1 and ord(text[0]) in (0x2013, 0x2014)):
        return None
    # fractions like 6 5/8
    m = re.fullmatch(r"(\d+)\s+(\d+)/(\d+)", text)
    if m:
        whole, num, den = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return whole + (num / den if den else 0)
    m = re.fullmatch(r"(\d+)/(\d+)", text)
    if m:
        num, den = int(m.group(1)), int(m.group(2))
        return num / den if den else None
    try:
        return float(text)
    except ValueError:
        return None


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "point"


def parse_sheet(path: Path) -> dict:
    wb = load_workbook(path, data_only=True, read_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()

    header_idx = None
    for i, row in enumerate(rows):
        first = clean(row[0] if row else "")
        if first.lower().startswith("measurement point"):
            header_idx = i
            break
    if header_idx is None:
        return {"ok": False, "error": "no measurement header", "path": str(path)}

    header = rows[header_idx]
    size_col = None
    size_label = None
    trial_cols: dict[int, int] = {}
    final_col = None
    remarks_col = None
    for j, cell in enumerate(header):
        label = clean(cell)
        low = label.lower()
        if not low:
            continue
        if low == "remarks":
            remarks_col = j
        elif low == "final" or low.startswith("final"):
            final_col = j
        elif "trial" in low:
            m = re.search(r"(\d+)", low)
            trial_cols[int(m.group(1)) if m else 1] = j
        elif low in {"sewing", "sewimg", "adjustment"}:
            continue
        elif size_col is None and (
            low.startswith("size")
            or low.startswith("r-")
            or low.startswith("l-")
            or low.startswith("s-")
            or re.fullmatch(r"[mls]|xl|xxl|xxxl|\d{2}", low)
        ):
            size_col = j
            size_label = label

    # Metadata above header
    pattern_ref = None
    description = None
    fabric_code = None
    sheet_stage = None
    name = None
    order_date = None
    for row in rows[:header_idx]:
        cells = [clean(c) for c in (row or [])]
        joined = " | ".join(c for c in cells if c)
        low_join = joined.lower()
        for j, cell in enumerate(cells):
            low = cell.lower().rstrip(":")
            if "pattern" in low and "ref" in low:
                pattern_ref = clean(
                    next((c for c in cells[j + 1 :] if c and c != ":"), "")
                ) or pattern_ref
            if low == "name":
                name = clean(next((c for c in cells[j + 1 :] if c and c != ":"), "")) or name
            if low == "description":
                description = (
                    clean(next((c for c in cells[j + 1 :] if c and c != ":"), "")) or description
                )
            if "fabric" in low and ("name" in low or "code" in low or low.endswith(":")):
                fabric_code = (
                    clean(next((c for c in cells[j + 1 :] if c and c != ":"), "")) or fabric_code
                )
            if low in {"order date", "orderdate"}:
                order_date = (
                    clean(next((c for c in cells[j + 1 :] if c and c != ":"), "")) or order_date
                )
        if re.search(r"\bfinal\b", low_join) and "measurement" not in low_join:
            sheet_stage = sheet_stage or "final"
        if re.search(r"\btrial\b", low_join) and "measurement" not in low_join:
            sheet_stage = sheet_stage or "trial"

    unit = "cm" if size_label and "cm" in size_label.lower() else None
    points = []
    special = None
    for row in rows[header_idx + 1 :]:
        cells = row or []
        first = clean(cells[0] if cells else "")
        if not first:
            continue
        if first.lower().startswith("special instruction"):
            trailing = clean(first.split(":", 1)[1]) if ":" in first else ""
            rest = " ".join(clean(c) for c in cells[1:] if clean(c))
            special = clean(f"{trailing} {rest}") or None
            break
        size_val = to_number(cells[size_col]) if size_col is not None and size_col < len(cells) else None
        trial_values = {}
        for n, col in trial_cols.items():
            val = to_number(cells[col]) if col < len(cells) else None
            if val is not None:
                trial_values[str(n)] = val
        final_val = (
            to_number(cells[final_col]) if final_col is not None and final_col < len(cells) else None
        )
        remarks = (
            clean(cells[remarks_col])
            if remarks_col is not None and remarks_col < len(cells)
            else ""
        )
        if size_val is None and not trial_values and final_val is None and not remarks:
            continue
        points.append(
            {
                "point_id": slugify(first),
                "name": first,
                "base_value": size_val,
                "target_value": size_val,
                "trial_values": trial_values,
                "final_value": final_val,
                "remarks": remarks or None,
            }
        )

    # Infer unit: prefer Total Length magnitude, else median. Length > 50 => cm.
    if unit is None and points:
        length = next(
            (
                p["base_value"]
                for p in points
                if p["base_value"] is not None
                and "length" in p["name"].lower()
                and "slv" not in p["name"].lower()
                and "sleeve" not in p["name"].lower()
            ),
            None,
        )
        if length is not None:
            unit = "cm" if length >= 50 else "in"
        else:
            vals = [p["base_value"] for p in points if p["base_value"] is not None]
            if vals:
                med = sorted(vals)[len(vals) // 2]
                # Shorts waist-extend in cm is often 45-60; half-waist inches is < 30.
                unit = "cm" if med >= 35 else "in"

    return {
        "ok": True,
        "path": str(path),
        "filename": path.name,
        "pattern_ref": pattern_ref,
        "client_name": name,
        "description": description,
        "fabric_code": fabric_code,
        "sheet_stage": sheet_stage,
        "size_label": size_label,
        "unit": unit or "in",
        "order_date": order_date,
        "special_instructions": special,
        "points": points,
        "filled_count": sum(1 for p in points if p["base_value"] is not None),
    }


def main():
    paths = [Path(p) for p in sys.argv[1:]]
    out = [parse_sheet(p) for p in paths]
    json.dump(out if len(out) != 1 else out[0], sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
