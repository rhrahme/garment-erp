#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render Mahrab TUD/measurements gap report JSON -> PDF (reportlab)."""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def ascii_safe(text) -> str:
    s = "" if text is None else str(text)
    return s.encode("ascii", "replace").decode("ascii")


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: render-mahrab-gap-report.py <report.json> <out.pdf>", file=sys.stderr)
        return 2
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    report = json.loads(src.read_text(encoding="utf-8"))
    summary = report.get("summary") or {}
    remaining = report.get("remaining_gaps") or []
    actions = report.get("actions") or {}
    unmatched = report.get("unmatched_folders") or []

    out.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(out),
        pagesize=landscape(A4),
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle("t", parent=styles["Heading1"], fontSize=14, spaceAfter=4)
    body = ParagraphStyle("b", parent=styles["Normal"], fontSize=8, leading=11)
    small = ParagraphStyle("s", parent=styles["Normal"], fontSize=7, leading=9)

    story = []
    story.append(Paragraph("Mahrab Pattern Archive - TUD + Measurements Gap Report", title))
    story.append(
        Paragraph(
            ascii_safe(
                f"Generated {report.get('generated_at') or datetime.now(timezone.utc).isoformat()} | "
                f"mode={report.get('mode')} | root={report.get('root')}"
            ),
            body,
        )
    )
    story.append(Spacer(1, 3 * mm))

    bits = [
        f"client folders scanned: {summary.get('scanned_client_folders', 0)}",
        f"matched: {summary.get('matched_client_folders', 0)}",
        f"garment rows: {summary.get('garment_rows', 0)}",
        f"already OK: {summary.get('already_ok', 0)}",
        f"need TUD (pre-run): {summary.get('need_tud', 0)}",
        f"need measurements (pre-run): {summary.get('need_measurements', 0)}",
        f"TUD uploaded this run: {summary.get('tud_uploaded_this_run', 0)}",
        f"measurements filled this run: {summary.get('measurements_filled_this_run', 0)}",
        f"patterns created: {summary.get('patterns_created_this_run', 0)}",
        f"jobs linked: {summary.get('jobs_linked_this_run', 0)}",
        f"failed: {summary.get('failed_this_run', 0)}",
        f"remaining gaps: {summary.get('remaining_gaps', 0)}",
    ]
    story.append(Paragraph(ascii_safe("<b>Summary:</b> " + " | ".join(bits)), body))
    if unmatched:
        story.append(
            Paragraph(
                ascii_safe("<b>Unmatched folders (skipped):</b> " + ", ".join(unmatched)),
                body,
            )
        )
    story.append(Spacer(1, 3 * mm))

    tud_up = actions.get("tud_uploaded") or []
    meas = actions.get("measurements_filled") or []
    if tud_up or meas:
        story.append(Paragraph("<b>Actions this run</b>", body))
        story.append(Spacer(1, 1 * mm))
        adata = [["Type", "Client / garment", "Detail"]]
        for a in tud_up[:80]:
            adata.append(
                [
                    "TUD",
                    Paragraph(ascii_safe(a.get("label")), small),
                    Paragraph(ascii_safe(a.get("file")), small),
                ]
            )
        for a in meas[:80]:
            adata.append(
                [
                    "MEAS",
                    Paragraph(ascii_safe(a.get("label")), small),
                    Paragraph(
                        ascii_safe(
                            f"{a.get('source')} ({a.get('before')}->{a.get('after')})"
                        ),
                        small,
                    ),
                ]
            )
        at = Table(adata, colWidths=[18 * mm, 90 * mm, 150 * mm], repeatRows=1)
        at.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a365d")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#eef2f7")],
                    ),
                ]
            )
        )
        story.append(at)
        story.append(Spacer(1, 4 * mm))

    story.append(
        Paragraph(
            ascii_safe(f"<b>Remaining gaps ({len(remaining)})</b>"),
            body,
        )
    )
    story.append(Spacer(1, 1 * mm))
    if not remaining:
        story.append(Paragraph("No remaining gaps after this run.", body))
    else:
        data = [["Client", "Code", "Garment", "Reason", "Source TUD", "Source XLSX", "Filled"]]
        for r in sorted(
            remaining,
            key=lambda x: (
                (x.get("client_name") or "").lower(),
                x.get("garment") or "",
            ),
        ):
            data.append(
                [
                    Paragraph(ascii_safe(r.get("client_name")), small),
                    Paragraph(ascii_safe(r.get("client_code")), small),
                    Paragraph(ascii_safe(r.get("garment")), small),
                    Paragraph(ascii_safe(r.get("remaining_reason")), small),
                    Paragraph(ascii_safe(Path(r.get("source_tud") or "").name), small),
                    Paragraph(ascii_safe(Path(r.get("source_xlsx") or "").name), small),
                    Paragraph(ascii_safe(str(r.get("filled_count", 0))), small),
                ]
            )
        table = Table(
            data,
            colWidths=[42 * mm, 28 * mm, 22 * mm, 45 * mm, 55 * mm, 55 * mm, 14 * mm],
            repeatRows=1,
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#222222")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 7),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 2),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#f5f5f5")],
                    ),
                ]
            )
        )
        story.append(table)

    story.append(Spacer(1, 4 * mm))
    story.append(
        Paragraph(
            ascii_safe(
                "Notes: Matching reuses import-mahrab-pattern.mjs FORCE_MATCH / FORCE_SKIP. "
                "TUD uploaded only when library pattern for that garment has no .tud. "
                "Measurements filled only into null/empty cells (never overwrite with empties). "
                "Sami Al Jameel left unmatched. MIN_FILLED_OK=4 for sparse detection."
            ),
            small,
        )
    )
    doc.build(story)
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
