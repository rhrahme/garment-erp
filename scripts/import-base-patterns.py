#!/usr/bin/env python3
"""
Import base-pattern measurement Excel files into src/data/pattern-library.json.

Handles the two spreadsheet formats the pattern team uses:
  A) Standard FR measurement spec — "Measurement point" header row, sizes across
     the top, optional Remarks column, "Special instruction:" footer.
  B) Hagan tech-pack (e.g. Massimo Linen Short 0197) — points with size ref
     (diagram code), tolerance, grading increment; unit cm.

Empty size columns/rows are preserved as nulls (sparse grids are real data).
Re-running upserts by deterministic base-pattern id, so tomorrow's GL files can
be imported with:  python3 scripts/import-base-patterns.py --folder <dir> \
    --brand-id gliani --brand-code GL

Usage:
  python3 scripts/import-base-patterns.py --folder "/path/to/Base Patterns " \
      [--brand-id fouad-rahme] [--brand-code FR] [--dry-run]

After importing, push the document to Supabase with:
  npm run db:migrate-json   (or let the app save it on first library write)
"""

import argparse
import datetime
import json
import os
import re
import sys
import unicodedata

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required: pip3 install openpyxl")

LIBRARY_PATH = os.path.join(os.path.dirname(__file__), "..", "src", "data", "pattern-library.json")

# ---------------------------------------------------------------------------
# Hygiene + canonical naming
# ---------------------------------------------------------------------------

# Misspellings / brand hygiene fixes seen in the team's files.
CUT_FAMILY_FIXES = {
    "boggy": "Boggi",
    "boggi": "Boggi",
    "suit suplly": "Suit Supply",
    "suit supply": "Suit Supply",
    "comfort": "Comfort",
    "massimo dutty": "Massimo",
    "massimo": "Massimo",
}

# Alias -> canonical measurement point name (per the team's own equivalences).
POINT_ALIASES = {
    "1/2 bottom width": "1/2 Hem Width",
    "total length (nps)": "Total Length (HNP)",
    "cuff width": "Cuff Height",
}

# Trim points that are constant across sizes even when the grid is sparse.
KNOWN_TRIM_POINTS = {
    "collar height",
    "collar point",
    "band height",
    "cuff height",
    "cuff width",
    "slv placket length",
    "waist band height",
    "bottom hem stitch height",
    "fly width",
}

GARMENT_HINTS = [
    ("short pant", "shorts"),
    ("shorts", "shorts"),
    ("short", "shorts"),
    ("jacket", "jacket"),
    ("shirt", "shirt"),
    ("trouser", "trouser"),
    ("pant", "trouser"),
    ("thobe", "thobe"),
]


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")


def clean(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def canonical_point_name(raw_name):
    return POINT_ALIASES.get(clean(raw_name).lower(), clean(raw_name))


def to_number(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def normalize_size(value):
    """'S- 22' -> 'S-22'; 48.0 -> '48'; 'L- 90' -> 'L-90'."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(int(value)) if float(value).is_integer() else str(value)
    text = clean(value)
    text = re.sub(r"([A-Za-z])\s*-\s*", r"\1-", text)
    return text


def detect_garment(*texts):
    for text in texts:
        lowered = clean(text).lower()
        for hint, garment in GARMENT_HINTS:
            if hint in lowered:
                return garment
    return None


def parse_family_and_variant(raw_name):
    """' Suit Suplly (Short)' -> ('Suit Supply', 'Short'); 'BOGGY' -> ('Boggi', None)."""
    name = clean(raw_name)
    variant = None
    match = re.search(r"\(([^)]+)\)\s*$", name)
    if match:
        variant = clean(match.group(1)).title()
        name = clean(name[: match.start()])
    lowered = name.lower()
    for key in sorted(CUT_FAMILY_FIXES, key=len, reverse=True):
        if lowered.startswith(key):
            return CUT_FAMILY_FIXES[key], variant
    return name.title() if name else None, variant


def detect_fabric(*texts):
    for text in texts:
        lowered = clean(text).lower()
        if "linen" in lowered:
            return "linen"
        if "cotton" in lowered:
            return "cotton"
        if "wool" in lowered:
            return "wool"
    return None


# ---------------------------------------------------------------------------
# Format A: standard FR measurement spec
# ---------------------------------------------------------------------------

def parse_standard_sheet(ws, filename):
    rows = [[cell.value for cell in row] for row in ws.iter_rows()]

    header_idx = None
    for i, row in enumerate(rows):
        if clean(row[0] if row else "").lower().startswith("measurement point"):
            header_idx = i
            break
    if header_idx is None:
        return None

    header = rows[header_idx]
    remarks_col = None
    for j, cell in enumerate(header):
        if clean(cell).lower() == "remarks":
            remarks_col = j
            break

    size_cols = []  # (col_index, size)
    limit = remarks_col if remarks_col is not None else len(header)
    for j in range(1, limit):
        size = normalize_size(header[j])
        if size:
            size_cols.append((j, size))
    sizes = [size for _, size in size_cols]

    # Metadata rows above the header.
    pattern_name = None
    style_code = None
    extra_notes = []
    title = clean(rows[0][0] if rows and rows[0] else "")
    for row in rows[:header_idx]:
        cells = [clean(cell) for cell in (row or [])]
        for j, cell in enumerate(cells):
            lowered = cell.lower()
            if lowered == "name" and j + 2 < len(cells):
                pattern_name = next((c for c in cells[j + 1 :] if c and c != ":"), None)
            if lowered in ("code:", "model:") and j + 1 < len(cells):
                style_code = next((c for c in cells[j + 1 :] if c), None)
            if lowered == "fabric code:":
                code = next((c for c in cells[j + 1 :] if c), None)
                if code:
                    extra_notes.append(f"Fabric code: {code}")

    points = []
    special_instructions = None
    for row in rows[header_idx + 1 :]:
        cells = row or []
        first = clean(cells[0] if cells else "")
        if first.lower().startswith("special instruction"):
            trailing = clean(first.split(":", 1)[1]) if ":" in first else ""
            rest = " ".join(clean(c) for c in cells[1:] if clean(c))
            special_instructions = clean(f"{trailing} {rest}") or None
            break
        if first.lower().startswith(("total ordered", "remarks")):
            continue
        if not first:
            continue

        values = {}
        for j, size in size_cols:
            values[size] = to_number(cells[j]) if j < len(cells) else None
        remark = clean(cells[remarks_col]) if remarks_col is not None and remarks_col < len(cells) else ""
        non_null = [v for v in values.values() if v is not None]
        fully_constant = len(non_null) == len(sizes) and len(set(non_null)) == 1 and len(sizes) > 1
        canonical = canonical_point_name(first)
        points.append(
            {
                "point_id": slugify(canonical),
                "name": clean(first),
                "remark": remark or None,
                "is_graded": not (fully_constant or canonical.lower() in KNOWN_TRIM_POINTS),
                "tolerance": None,
                "grading_increment": None,
                "diagram_code": None,
                "values": values,
            }
        )

    family, variant = parse_family_and_variant(pattern_name or "")
    garment = detect_garment(title, filename) or "unknown"
    fabric = detect_fabric(pattern_name or "", filename)

    return {
        "cut_family": family or "Unknown",
        "cut_variant": variant,
        "garment_type": garment,
        "unit": "in",
        "sizes": sizes,
        "points": points,
        "style_code": clean(style_code) or None,
        "fabric": fabric,
        "season": None,
        "special_instructions": special_instructions,
        "notes": "; ".join(extra_notes) or None,
        "display_name": clean(pattern_name) or None,
    }


# ---------------------------------------------------------------------------
# Format B: Hagan tech-pack (size ref / tolerance / grading, cm)
# ---------------------------------------------------------------------------

def parse_techpack_sheet(ws, filename):
    rows = [[cell.value for cell in row] for row in ws.iter_rows()]

    header_idx = None
    ref_col = None
    for i, row in enumerate(rows):
        for j, cell in enumerate(row or []):
            if clean(cell).lower().startswith("size ref"):
                header_idx, ref_col = i, j
                break
        if header_idx is not None:
            break
    if header_idx is None:
        return None

    header = rows[header_idx]
    point_col = ref_col - 1
    tol_col = None
    grading_col = None
    for j, cell in enumerate(header):
        lowered = clean(cell).lower()
        if lowered.startswith("tole"):
            tol_col = j
        if lowered == "grading":
            grading_col = j

    size_cols = []
    start = (tol_col if tol_col is not None else ref_col) + 1
    stop = grading_col if grading_col is not None else len(header)
    for j in range(start, stop):
        size = normalize_size(header[j])
        if size:
            size_cols.append((j, size))
    sizes = [size for _, size in size_cols]

    # Metadata: customer / style / model / season live above the header row.
    customer = None
    style_name = None
    style_code = None
    season = None
    for row in rows[: header_idx + 1]:
        cells = [clean(cell) for cell in (row or [])]
        for j, cell in enumerate(cells):
            lowered = cell.lower()
            if lowered.startswith("customer") and j + 1 < len(cells):
                customer = next((c for c in cells[j + 1 :] if c), None)
            if lowered == "style name" and j + 1 < len(cells):
                style_name = next((c for c in cells[j + 1 :] if c), None)
            if lowered.startswith("model") and j + 1 < len(cells):
                style_code = next((c for c in cells[j + 1 :] if c), None)
            if re.fullmatch(r"(SS|AW|FW)\d{2}", cell):
                season = cell

    points = []
    for row in rows[header_idx + 1 :]:
        cells = row or []
        name = clean(cells[point_col] if point_col < len(cells) else "")
        if not name:
            continue
        values = {}
        for j, size in size_cols:
            values[size] = to_number(cells[j]) if j < len(cells) else None
        grading = to_number(cells[grading_col]) if grading_col is not None and grading_col < len(cells) else None
        canonical = canonical_point_name(name)
        points.append(
            {
                "point_id": slugify(canonical),
                "name": name,
                "remark": None,
                "is_graded": bool(grading) and grading != 0,
                "tolerance": to_number(cells[tol_col]) if tol_col is not None and tol_col < len(cells) else None,
                "grading_increment": grading,
                "diagram_code": clean(cells[ref_col]) if ref_col < len(cells) else None or None,
                "values": values,
            }
        )
    for point in points:
        if not point["diagram_code"]:
            point["diagram_code"] = None

    family, variant = parse_family_and_variant(customer or "")
    garment = detect_garment(style_name or "", filename) or "unknown"
    fabric = detect_fabric(style_name or "", filename)

    return {
        "cut_family": family or "Unknown",
        "cut_variant": variant,
        "garment_type": garment,
        "unit": "cm",
        "sizes": sizes,
        "points": points,
        "style_code": clean(style_code) or None,
        "fabric": fabric,
        "season": season,
        "special_instructions": None,
        "notes": clean(style_name) or None,
        "display_name": clean(style_name) or None,
    }


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------

def parse_workbook(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    filename = os.path.basename(path)
    for ws in wb.worksheets:
        flat = [clean(cell.value).lower() for row in ws.iter_rows() for cell in row]
        if any(text.startswith("size ref") for text in flat):
            parsed = parse_techpack_sheet(ws, filename)
        else:
            parsed = parse_standard_sheet(ws, filename)
        if parsed and parsed["points"]:
            return parsed
    return None


def base_pattern_id(brand_code, parsed):
    parts = [
        "bp",
        brand_code.lower(),
        slugify(parsed["cut_family"]),
        slugify(parsed["garment_type"]),
    ]
    if parsed["cut_variant"]:
        parts.append(slugify(parsed["cut_variant"]))
    # Disambiguate multiple bases of the same family+garment (Massimo cotton vs linen).
    if parsed["fabric"]:
        parts.append(slugify(parsed["fabric"]))
    if parsed["style_code"]:
        parts.append(slugify(parsed["style_code"]))
    return "-".join(parts)


def display_name(brand_code, parsed):
    bits = [parsed["cut_family"], parsed["garment_type"].capitalize()]
    if parsed["fabric"]:
        bits.insert(1, parsed["fabric"].capitalize())
    if parsed["cut_variant"]:
        bits.append(f"({parsed['cut_variant']})")
    if parsed["style_code"]:
        bits.append(parsed["style_code"])
    return " ".join(bits)


def merge_dictionary(dictionary, base):
    by_id = {entry["id"]: entry for entry in dictionary}
    for point in base["points"]:
        canonical = canonical_point_name(point["name"])
        entry = by_id.get(point["point_id"])
        if entry is None:
            entry = {
                "id": point["point_id"],
                "name": canonical,
                "aliases": [],
                "garment_types": [],
            }
            dictionary.append(entry)
            by_id[point["point_id"]] = entry
        display = clean(point["name"])
        if display != entry["name"] and display not in entry["aliases"]:
            entry["aliases"].append(display)
        if base["garment_type"] not in entry["garment_types"]:
            entry["garment_types"].append(base["garment_type"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder", required=True, help="Folder containing the .xlsx files")
    parser.add_argument("--brand-id", default="fouad-rahme", help="Factory brand id (fouad-rahme, gliani)")
    parser.add_argument("--brand-code", default="FR", help="House brand code (FR, GL)")
    parser.add_argument("--dry-run", action="store_true", help="Parse and report without writing")
    args = parser.parse_args()

    folder = args.folder
    if not os.path.isdir(folder):
        sys.exit(f"Folder not found: {folder!r}")

    library_path = os.path.abspath(LIBRARY_PATH)
    with open(library_path) as fh:
        library = json.load(fh)
    library.setdefault("dictionary", [])
    library.setdefault("base_patterns", [])
    library.setdefault("client_patterns", [])

    existing_by_id = {base["id"]: base for base in library["base_patterns"]}
    timestamp = now_iso()
    imported = []

    for filename in sorted(os.listdir(folder)):
        if not filename.lower().endswith(".xlsx") or filename.startswith("~"):
            continue
        path = os.path.join(folder, filename)
        parsed = parse_workbook(path)
        if not parsed:
            print(f"  SKIP (unrecognized layout): {filename}")
            continue

        base_id = base_pattern_id(args.brand_code, parsed)
        previous = existing_by_id.get(base_id)
        base = {
            "id": base_id,
            "house_brand_id": args.brand_id,
            "house_brand_code": args.brand_code.upper(),
            "cut_family": parsed["cut_family"],
            "garment_type": parsed["garment_type"],
            "cut_variant": parsed["cut_variant"],
            "name": display_name(args.brand_code, parsed),
            "unit": parsed["unit"],
            "sizes": parsed["sizes"],
            "points": parsed["points"],
            "style_code": parsed["style_code"],
            "fabric": parsed["fabric"],
            "season": parsed["season"],
            "special_instructions": parsed["special_instructions"],
            "physical_pattern_kept": previous.get("physical_pattern_kept", False) if previous else False,
            "physical_pattern_location": previous.get("physical_pattern_location") if previous else None,
            "files": previous.get("files", []) if previous else [],
            "source_file": filename,
            "notes": parsed["notes"],
            "created_at": previous.get("created_at", timestamp) if previous else timestamp,
            "updated_at": timestamp,
        }
        existing_by_id[base_id] = base
        merge_dictionary(library["dictionary"], base)

        cells = sum(len(p["values"]) for p in base["points"])
        filled = sum(1 for p in base["points"] for v in p["values"].values() if v is not None)
        imported.append(base)
        print(
            f"  OK {base_id}\n"
            f"     {base['name']} | {len(base['sizes'])} sizes | {len(base['points'])} points | "
            f"{filled}/{cells} cells filled | unit={base['unit']}"
        )

    library["base_patterns"] = sorted(existing_by_id.values(), key=lambda b: b["id"])
    library["updated_at"] = timestamp

    print(
        f"\nImported {len(imported)} base pattern(s); library now has "
        f"{len(library['base_patterns'])} base(s), {len(library['dictionary'])} dictionary point(s)."
    )

    if args.dry_run:
        print("Dry run — nothing written.")
        return

    with open(library_path, "w") as fh:
        json.dump(library, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"Wrote {library_path}")


if __name__ == "__main__":
    main()
