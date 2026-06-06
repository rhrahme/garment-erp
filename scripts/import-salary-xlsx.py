#!/usr/bin/env python3
"""Import payroll rows from salary details Excel into src/data/payroll-employees.json."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import openpyxl
except ImportError as exc:
    raise SystemExit("Install openpyxl: pip3 install openpyxl") from exc

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = ROOT / "src/data/hr/salary-details-revised.xlsx"
OUT_PATH = ROOT / "src/data/payroll-employees.json"

HEADER_MAP = {
    "S.No": "s_no",
    "Emp. ID. No.": "employee_id_number",
    "Emp. Name": "full_name",
    "Emp. Bank": "bank_name",
    "Emp. Acc. No.": "account_number",
    "Salary Amount": "salary_amount",
    "Basic Salary": "basic_salary",
    "Housing Allowance": "housing_allowance",
    "Other Earnings": "other_earnings",
    "Deduction": "deduction",
    "Payment Description": "payment_description",
    "Employee Address 1": "address_1",
    "Employee Address 2": "address_2",
    "Employee Address 3": "address_3",
}

NUMERIC_FIELDS = {
    "salary_amount",
    "basic_salary",
    "housing_allowance",
    "other_earnings",
    "deduction",
}


def clean_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def parse_number(value: object) -> float:
    text = clean_text(value).replace(",", "")
    if not text:
        return 0.0
    return float(text)


def import_workbook(xlsx_path: Path) -> list[dict]:
    workbook = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return []

    header = [clean_text(cell) for cell in rows[0]]
    missing = [label for label in HEADER_MAP if label not in header]
    if missing:
        raise SystemExit(f"Missing expected columns: {', '.join(missing)}")

    employees: list[dict] = []
    for row in rows[1:]:
        if not row or not any(cell not in (None, "") for cell in row):
            continue
        raw = {header[i]: row[i] if i < len(row) else None for i in range(len(header))}
        employee_id = clean_text(raw.get("Emp. ID. No."))
        full_name = clean_text(raw.get("Emp. Name"))
        if not employee_id and not full_name:
            continue

        entry: dict = {
            "id": employee_id or f"emp-{len(employees) + 1}",
            "is_active": True,
        }
        for source, target in HEADER_MAP.items():
            value = raw.get(source)
            if target in NUMERIC_FIELDS:
                entry[target] = parse_number(value)
            elif target == "s_no":
                entry[target] = int(parse_number(value)) if clean_text(value) else len(employees) + 1
            else:
                entry[target] = clean_text(value)
        employees.append(entry)

    return employees


def main() -> None:
    xlsx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx_path.exists():
        raise SystemExit(f"File not found: {xlsx_path}")

    employees = import_workbook(xlsx_path)
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source_file": str(xlsx_path.relative_to(ROOT)) if xlsx_path.is_relative_to(ROOT) else xlsx_path.name,
        "currency": "SAR",
        "employees": employees,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(employee["salary_amount"] for employee in employees)
    print(f"Imported {len(employees)} employees · total payroll SAR {total:,.0f} → {OUT_PATH}")


if __name__ == "__main__":
    main()
