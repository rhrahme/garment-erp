#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Report active pattern jobs / SO fabric lines missing ClientPatterns or .tud files.

Prefers production Supabase erp_documents (pattern_jobs, pattern_library,
sales_orders); falls back to local JSON under src/data/.

Usage:
  python3 scripts/report-missing-pattern-tud.py
  python3 scripts/report-missing-pattern-tud.py --local
  python3 scripts/report-missing-pattern-tud.py --out ~/Downloads/pattern-missing-tud-report.pdf
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
DEFAULT_OUT = Path.home() / "Downloads" / "pattern-missing-tud-report.pdf"

# Canonical stitch labels (sales) + common library lowercase keys.
CANONICAL_GARMENTS = {
    "short": "Short",
    "shorts": "Short",
    "trouser": "Trouser",
    "trousers": "Trouser",
    "pant": "Trouser",
    "pants": "Trouser",
    "jacket": "Jacket",
    "blazer": "Jacket",
    "vest": "Vest",
    "suit": "Suit",
    "suit+vest": "Suit+Vest",
    "shirt": "Shirt LS",
    "shirt ls": "Shirt LS",
    "shirt ss": "Shirt SS",
    "polo": "Polo",
    "t-shirt": "T-shirt",
    "tshirt": "T-shirt",
    "overshirt": "Overshirt",
    "overshirt+trouser": "Overshirt+Trouser",
    "overcoat": "Overcoat",
    "formal thobe": "Formal Thobe",
    "house thobe": "House Thobe",
    "thobe": "Formal Thobe",
    "thobe+jacket": "Thobe+Jacket",
    "thobe+vest": "Thobe+Vest",
    "shirt+trouser": "Shirt+Trouser",
    "shirt+trouser+short": "Shirt+Trouser+Short",
    "shirt+short": "Shirt+Short",
    "fabric only": "Fabric only",
    "custom": "custom",
}

# Dedicated library keys that count as a match for a sheet garment
# (mirrors dedicatedLibraryGarmentKeysForSheet - no soft polo?shirt etc.).
DEDICATED_KEYS: dict[str, set[str]] = {
    "short": {"short", "shorts"},
    "shorts": {"short", "shorts"},
    "shirt ls": {"shirt ls", "shirt", "shirt ss"},  # shirt family sheets share bases
    "shirt ss": {"shirt ss", "shirt", "shirt ls"},
    "shirt": {"shirt", "shirt ls", "shirt ss"},
    "polo": {"polo"},
    "t-shirt": {"t-shirt", "tshirt"},
    "tshirt": {"t-shirt", "tshirt"},
    "trouser": {"trouser", "trousers"},
    "trousers": {"trouser", "trousers"},
    "jacket": {"jacket"},
    "vest": {"vest"},
    "suit": {"suit"},
    "suit+vest": {"suit+vest", "suit", "vest"},
    "overshirt": {"overshirt"},
    "overshirt+trouser": {"overshirt+trouser", "overshirt", "trouser"},
    "overcoat": {"overcoat"},
    "formal thobe": {"formal thobe", "thobe", "house thobe"},
    "house thobe": {"house thobe", "thobe", "formal thobe"},
    "thobe": {"thobe", "formal thobe", "house thobe"},
    "thobe+jacket": {"thobe+jacket", "thobe", "jacket"},
    "thobe+vest": {"thobe+vest", "thobe", "vest"},
    "shirt+trouser": {"shirt+trouser", "shirt", "shirt ls", "trouser"},
    "shirt+trouser+short": {
        "shirt+trouser+short",
        "shirt",
        "shirt ls",
        "trouser",
        "short",
        "shorts",
    },
    "shirt+short": {"shirt+short", "shirt", "shirt ls", "short", "shorts"},
}


def load_env_local() -> dict[str, str]:
    env_path = REPO / ".env.local"
    out: dict[str, str] = {}
    if not env_path.exists():
        return out
    for line in env_path.read_text(encoding="utf-8").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
            continue
        key, value = trimmed.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in out:
            out[key] = value
    return out


def ascii_safe(text: Any) -> str:
    s = "" if text is None else str(text)
    return s.encode("ascii", "replace").decode("ascii")


def normalize_garment(raw: str | None) -> str:
    if not raw:
        return "(unknown)"
    trimmed = str(raw).strip()
    if not trimmed:
        return "(unknown)"
    key = trimmed.lower()
    if key in CANONICAL_GARMENTS:
        return CANONICAL_GARMENTS[key]
    # Title-case unknowns lightly
    for stitch, canon in CANONICAL_GARMENTS.items():
        if stitch == key:
            return canon
    return trimmed


def garment_keys(garment: str) -> set[str]:
    """Keys used to match client_pattern.garment_type to a job/line garment."""
    norm = normalize_garment(garment)
    lower = norm.lower()
    keys = {lower, str(garment).strip().lower()}
    if lower in DEDICATED_KEYS:
        keys |= DEDICATED_KEYS[lower]
    # Also expand compounds
    if "+" in lower:
        for part in lower.split("+"):
            part = part.strip()
            if not part:
                continue
            keys.add(part)
            keys |= DEDICATED_KEYS.get(part, {part})
            keys.add(CANONICAL_GARMENTS.get(part, part).lower())
    # short/shorts synonym always
    if "short" in keys or "shorts" in keys:
        keys.update({"short", "shorts"})
    return {k for k in keys if k}


def garments_match(job_garment: str, pattern_garment: str) -> bool:
    job_keys = garment_keys(job_garment)
    pat_keys = garment_keys(pattern_garment)
    # Exact/synonym overlap on dedicated families
    return bool(job_keys & pat_keys)


def attachment_is_tud(att: dict[str, Any]) -> bool:
    kind = (att.get("kind") or "").lower()
    filename = (att.get("filename") or att.get("stored_filename") or "").lower()
    return kind == "tud" or filename.endswith(".tud")


def pattern_tud_files(pattern: dict[str, Any]) -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []
    for f in pattern.get("files") or []:
        if isinstance(f, dict) and attachment_is_tud(f):
            files.append(f)
    for ver in pattern.get("versions") or []:
        if not isinstance(ver, dict):
            continue
        for f in ver.get("files") or []:
            if isinstance(f, dict) and attachment_is_tud(f):
                files.append(f)
    return files


def pattern_has_tud(pattern: dict[str, Any]) -> bool:
    return len(pattern_tud_files(pattern)) > 0


def read_local_json(rel: str) -> dict[str, Any]:
    path = REPO / rel
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_supabase_doc(url: str, key: str, doc_id: str) -> dict[str, Any] | None:
    endpoint = (
        f"{url.rstrip('/')}/rest/v1/erp_documents"
        f"?id=eq.{urllib.parse.quote(doc_id)}&select=data"
    )
    req = urllib.request.Request(
        endpoint,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase fetch {doc_id} failed: {exc.code} {body}") from exc
    if not rows:
        return None
    data = rows[0].get("data")
    return data if isinstance(data, dict) else None


def load_documents(prefer_local: bool) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], str]:
    local_jobs = read_local_json("src/data/pattern-jobs.json")
    local_lib = read_local_json("src/data/pattern-library.json")
    local_so = read_local_json("src/data/sales-orders.json")

    if prefer_local:
        return local_jobs, local_lib, local_so, "local JSON"

    env = load_env_local()
    url = (env.get("NEXT_PUBLIC_SUPABASE_URL") or "").strip()
    key = (
        env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SECRET_KEY") or ""
    ).strip()
    if not url or not key:
        print("WARN: Supabase credentials missing - using local JSON", file=sys.stderr)
        return local_jobs, local_lib, local_so, "local JSON (no credentials)"

    try:
        jobs = fetch_supabase_doc(url, key, "pattern_jobs") or local_jobs
        lib = fetch_supabase_doc(url, key, "pattern_library") or local_lib
        so = fetch_supabase_doc(url, key, "sales_orders") or local_so
        return jobs, lib, so, "Supabase erp_documents"
    except Exception as exc:  # noqa: BLE001
        print(f"WARN: Supabase load failed ({exc}) - using local JSON", file=sys.stderr)
        return local_jobs, local_lib, local_so, "local JSON (supabase error)"


def index_client_patterns(
    client_patterns: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    by_client: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for p in client_patterns:
        cid = (p.get("client_id") or "").strip()
        if cid:
            by_client[cid].append(p)
    return by_client


def matching_patterns_for(
    patterns: list[dict[str, Any]], garment: str
) -> list[dict[str, Any]]:
    return [p for p in patterns if garments_match(garment, p.get("garment_type") or "")]


def classify_row(
    *,
    client_id: str,
    garment: str,
    linked_pattern_id: str | None,
    patterns_by_client: dict[str, list[dict[str, Any]]],
    patterns_by_id: dict[str, dict[str, Any]],
) -> list[str]:
    """Return list of missing reasons (empty = OK)."""
    reasons: list[str] = []
    client_patterns = patterns_by_client.get(client_id) or []
    matches = matching_patterns_for(client_patterns, garment)
    matches_with_tud = [p for p in matches if pattern_has_tud(p)]

    linked = patterns_by_id.get(linked_pattern_id) if linked_pattern_id else None

    if not linked_pattern_id:
        reasons.append("job unlinked")

    if linked is not None and not pattern_has_tud(linked):
        reasons.append("linked pattern has no TUD")

    if not matches:
        reasons.append("no pattern sheet")
    elif not matches_with_tud:
        # Has sheet(s) for garment but none with .tud
        if "linked pattern has no TUD" not in reasons:
            reasons.append("pattern but no TUD")

    # If linked and has TUD, and we only had "job unlinked" - that's fine to keep
    # If fully OK: linked + has tud (client also has tud pattern) ? clear
    if linked is not None and pattern_has_tud(linked):
        # Linked pattern is good - drop garment-level "pattern but no TUD" /
        # "no pattern sheet" noise; keep only if somehow inconsistent.
        reasons = [r for r in reasons if r == "job unlinked"]
        # Linked means not unlinked
        reasons = [r for r in reasons if r != "job unlinked"]
        return reasons

    # Unlinked but client has a good pattern with TUD ? only "job unlinked"
    if not linked_pattern_id and matches_with_tud:
        return ["job unlinked"]

    # Unlinked, has pattern sheet(s) without TUD
    if not linked_pattern_id and matches and not matches_with_tud:
        return ["job unlinked", "pattern but no TUD"]

    # Unlinked, no sheet
    if not linked_pattern_id and not matches:
        return ["job unlinked", "no pattern sheet"]

    # Linked without TUD - already captured; also surface if no other sheets with TUD
    if linked is not None and not pattern_has_tud(linked):
        out = ["linked pattern has no TUD"]
        if not matches_with_tud and matches:
            # only the linked (or others) without tud
            pass
        elif not matches:
            out.append("no pattern sheet")
        return out

    return reasons


def build_rows(
    jobs_doc: dict[str, Any],
    lib_doc: dict[str, Any],
    so_doc: dict[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    jobs = [j for j in (jobs_doc.get("jobs") or []) if isinstance(j, dict)]
    active_jobs = [j for j in jobs if (j.get("status") or "").lower() != "cancelled"]

    client_patterns = [
        p for p in (lib_doc.get("client_patterns") or []) if isinstance(p, dict)
    ]
    patterns_by_id = {p["id"]: p for p in client_patterns if p.get("id")}
    patterns_by_client = index_client_patterns(client_patterns)

    orders = [o for o in (so_doc.get("orders") or []) if isinstance(o, dict)]
    # Line lookup for article / extra context
    line_by_id: dict[str, dict[str, Any]] = {}
    order_by_id: dict[str, dict[str, Any]] = {}
    for o in orders:
        order_by_id[o.get("id") or ""] = o
        for idx, line in enumerate(o.get("fabric_lines") or []):
            if isinstance(line, dict) and line.get("id"):
                line_by_id[line["id"]] = {**line, "_article": idx + 1, "_so": o}

    # Track which SO lines already have an active job
    covered_line_ids = {
        j.get("sales_order_line_id")
        for j in active_jobs
        if j.get("sales_order_line_id")
    }

    rows: list[dict[str, Any]] = []

    for job in active_jobs:
        garment = normalize_garment(job.get("garment_type"))
        if garment == "Fabric only":
            continue
        linked_id = (job.get("client_pattern_id") or "").strip() or None
        reasons = classify_row(
            client_id=job.get("client_id") or "",
            garment=job.get("garment_type") or garment,
            linked_pattern_id=linked_id,
            patterns_by_client=patterns_by_client,
            patterns_by_id=patterns_by_id,
        )
        if not reasons:
            continue

        line = line_by_id.get(job.get("sales_order_line_id") or "")
        article = job.get("article_number")
        if article is None and line:
            article = line.get("_article")

        linked = patterns_by_id.get(linked_id) if linked_id else None
        client_matches = matching_patterns_for(
            patterns_by_client.get(job.get("client_id") or "") or [],
            job.get("garment_type") or garment,
        )
        matches_with_tud = [p for p in client_matches if pattern_has_tud(p)]

        rows.append(
            {
                "source": "pattern_job",
                "job_id": job.get("id"),
                "job_status": job.get("status"),
                "client_id": job.get("client_id"),
                "client_name": job.get("client_name") or "",
                "client_code": job.get("client_code") or "",
                "so_number": job.get("so_number") or "",
                "article": article,
                "line_id": job.get("sales_order_line_id"),
                "garment_type": garment,
                "garment_raw": job.get("garment_type") or "",
                "fabric_number": job.get("fabric_number") or "",
                "supplier": job.get("supplier") or "",
                "missing": reasons,
                "linked_pattern_id": linked_id,
                "linked_pattern_ref": (linked or {}).get("pattern_ref"),
                "client_patterns_for_garment": len(client_matches),
                "client_patterns_with_tud": len(matches_with_tud),
            }
        )

    # SO fabric lines with no active pattern job -- only on non-complete orders
    # (complete SOs are historical; live pattern work is tracked via jobs).
    for o in orders:
        if (o.get("status") or "").lower() == "complete":
            continue
        so_number = o.get("so_number") or ""
        for idx, line in enumerate(o.get("fabric_lines") or []):
            if not isinstance(line, dict):
                continue
            lid = line.get("id")
            if not lid or lid in covered_line_ids:
                continue
            garment = normalize_garment(line.get("garment_type"))
            if garment == "Fabric only":
                continue
            reasons = classify_row(
                client_id=o.get("client_id") or "",
                garment=line.get("garment_type") or garment,
                linked_pattern_id=None,
                patterns_by_client=patterns_by_client,
                patterns_by_id=patterns_by_id,
            )
            if not reasons:
                reasons = ["no pattern job"]
            else:
                reasons = [
                    ("no pattern job" if r == "job unlinked" else r) for r in reasons
                ]

            client_matches = matching_patterns_for(
                patterns_by_client.get(o.get("client_id") or "") or [],
                line.get("garment_type") or garment,
            )
            matches_with_tud = [p for p in client_matches if pattern_has_tud(p)]

            # Skip SO-only rows that already have a matching pattern with TUD
            # and merely lack a pattern job.
            if matches_with_tud and set(reasons) <= {"no pattern job"}:
                continue

            rows.append(
                {
                    "source": "so_line_no_job",
                    "job_id": None,
                    "job_status": None,
                    "client_id": o.get("client_id"),
                    "client_name": o.get("client_name") or "",
                    "client_code": o.get("client_code") or "",
                    "so_number": so_number,
                    "article": idx + 1,
                    "line_id": lid,
                    "garment_type": garment,
                    "garment_raw": line.get("garment_type") or "",
                    "fabric_number": line.get("fabric_number") or "",
                    "supplier": line.get("supplier_name") or "",
                    "missing": reasons,
                    "linked_pattern_id": None,
                    "linked_pattern_ref": None,
                    "client_patterns_for_garment": len(client_matches),
                    "client_patterns_with_tud": len(matches_with_tud),
                }
            )

    rows.sort(
        key=lambda r: (
            (r.get("client_name") or "").lower(),
            r.get("client_code") or "",
            r.get("garment_type") or "",
            r.get("so_number") or "",
            r.get("article") or 0,
        )
    )

    # Client+garment groups missing a pattern-with-TUD
    groups_missing_tud: list[dict[str, Any]] = []
    seen_group: set[tuple[str, str]] = set()
    for r in rows:
        gkey = (r.get("client_id") or "", r.get("garment_type") or "")
        if gkey in seen_group:
            continue
        if r.get("client_patterns_with_tud", 0) > 0:
            continue
        seen_group.add(gkey)
        groups_missing_tud.append(
            {
                "client_id": r.get("client_id"),
                "client_name": r.get("client_name"),
                "client_code": r.get("client_code"),
                "garment_type": r.get("garment_type"),
                "has_sheet": (r.get("client_patterns_for_garment") or 0) > 0,
            }
        )

    job_rows = [r for r in rows if r.get("source") == "pattern_job"]
    meta = {
        "active_jobs": len(active_jobs),
        "cancelled_jobs": sum(
            1 for j in jobs if (j.get("status") or "").lower() == "cancelled"
        ),
        "total_jobs": len(jobs),
        "client_patterns": len(client_patterns),
        "client_patterns_with_tud": sum(1 for p in client_patterns if pattern_has_tud(p)),
        "missing_rows": len(rows),
        "missing_pattern_jobs": len(job_rows),
        "missing_so_lines": sum(1 for r in rows if r.get("source") == "so_line_no_job"),
        "jobs_no_client_tud": sum(
            1 for r in job_rows if (r.get("client_patterns_with_tud") or 0) == 0
        ),
        "groups_missing_tud": groups_missing_tud,
        "by_garment": Counter(r["garment_type"] for r in rows),
        "by_garment_no_tud_group": Counter(
            g["garment_type"] for g in groups_missing_tud
        ),
        "by_reason": Counter(reason for r in rows for reason in r["missing"]),
        "by_source": Counter(r["source"] for r in rows),
    }
    return rows, meta


def write_pdf(
    path: Path,
    rows: list[dict[str, Any]],
    meta: dict[str, Any],
    source_label: str,
) -> None:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(path),
        pagesize=landscape(A4),
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )
    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "Title2",
        parent=styles["Heading1"],
        fontSize=14,
        spaceAfter=6,
    )
    body = ParagraphStyle(
        "Body2",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
    )
    small = ParagraphStyle(
        "Small2",
        parent=styles["Normal"],
        fontSize=7,
        leading=9,
    )

    story: list[Any] = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    story.append(Paragraph("Pattern jobs missing ClientPattern / .TUD", title))
    story.append(
        Paragraph(
            ascii_safe(
                f"Generated {now} | Data source: {source_label} | "
                f"Active jobs: {meta['active_jobs']} | "
                f"Client patterns: {meta['client_patterns']} "
                f"({meta['client_patterns_with_tud']} with TUD)"
            ),
            body,
        )
    )
    story.append(Spacer(1, 4 * mm))

    n_missing = meta["missing_rows"]
    n_groups = len(meta["groups_missing_tud"])
    story.append(
        Paragraph(
            ascii_safe(
                f"<b>Summary:</b> {n_missing} gap row(s) "
                f"({meta.get('missing_pattern_jobs', 0)} active pattern jobs, "
                f"{meta.get('missing_so_lines', 0)} open-SO lines without a job). "
                f"{n_groups} distinct client+garment group(s) have no ClientPattern with a .tud. "
                f"{meta.get('jobs_no_client_tud', 0)} active job row(s) sit on those no-TUD groups."
            ),
            body,
        )
    )

    group_garment_bits = ", ".join(
        f"{g}: {c}"
        for g, c in sorted(
            meta.get("by_garment_no_tud_group", {}).items(),
            key=lambda x: (-x[1], x[0]),
        )
    )
    story.append(
        Paragraph(
            ascii_safe(
                f"<b>Client+garment groups missing .tud (by garment):</b> "
                f"{group_garment_bits or '(none)'}"
            ),
            body,
        )
    )
    garment_bits = ", ".join(
        f"{g}: {c}" for g, c in sorted(meta["by_garment"].items(), key=lambda x: (-x[1], x[0]))
    )
    story.append(
        Paragraph(ascii_safe(f"<b>All gap rows by garment:</b> {garment_bits or '(none)'}"), body)
    )
    reason_bits = ", ".join(
        f"{g}: {c}" for g, c in sorted(meta["by_reason"].items(), key=lambda x: (-x[1], x[0]))
    )
    story.append(Paragraph(ascii_safe(f"<b>By reason (row tags):</b> {reason_bits or '(none)'}"), body))
    source_bits = ", ".join(f"{g}: {c}" for g, c in sorted(meta["by_source"].items()))
    story.append(Paragraph(ascii_safe(f"<b>By source:</b> {source_bits or '(none)'}"), body))
    story.append(Spacer(1, 3 * mm))

    # Client+garment groups without any TUD pattern
    if meta["groups_missing_tud"]:
        story.append(
            Paragraph(
                ascii_safe(
                    f"<b>Client + garment groups with no .tud pattern "
                    f"({len(meta['groups_missing_tud'])}):</b>"
                ),
                body,
            )
        )
        gdata = [["Client", "Code", "Garment", "Has sheet?"]]
        for g in sorted(
            meta["groups_missing_tud"],
            key=lambda x: (
                (x.get("client_name") or "").lower(),
                x.get("garment_type") or "",
            ),
        ):
            gdata.append(
                [
                    ascii_safe(g.get("client_name")),
                    ascii_safe(g.get("client_code")),
                    ascii_safe(g.get("garment_type")),
                    "yes (no TUD)" if g.get("has_sheet") else "no",
                ]
            )
        gt = Table(gdata, colWidths=[70 * mm, 35 * mm, 40 * mm, 30 * mm])
        gt.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#222222")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#f5f5f5")],
                    ),
                ]
            )
        )
        story.append(gt)
        story.append(Spacer(1, 4 * mm))

    story.append(Paragraph("<b>Detail rows</b>", body))
    story.append(Spacer(1, 2 * mm))

    if not rows:
        story.append(Paragraph("No missing pattern/TUD rows found.", body))
    else:
        header = [
            "Client",
            "Code",
            "SO",
            "Line",
            "Garment",
            "Fabric",
            "Missing",
            "Src",
        ]
        data = [header]
        for r in rows:
            line_label = ""
            if r.get("article") is not None:
                line_label = f"#{r['article']}"
            data.append(
                [
                    Paragraph(ascii_safe(r.get("client_name") or ""), small),
                    Paragraph(ascii_safe(r.get("client_code") or ""), small),
                    Paragraph(ascii_safe(r.get("so_number") or ""), small),
                    Paragraph(ascii_safe(line_label), small),
                    Paragraph(ascii_safe(r.get("garment_type") or ""), small),
                    Paragraph(ascii_safe(r.get("fabric_number") or ""), small),
                    Paragraph(ascii_safe("; ".join(r.get("missing") or [])), small),
                    Paragraph(
                        ascii_safe(
                            "job" if r.get("source") == "pattern_job" else "SO only"
                        ),
                        small,
                    ),
                ]
            )
        table = Table(
            data,
            colWidths=[48 * mm, 28 * mm, 28 * mm, 12 * mm, 32 * mm, 28 * mm, 70 * mm, 18 * mm],
            repeatRows=1,
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a365d")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 7),
                    ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 2),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#eef2f7")],
                    ),
                ]
            )
        )
        story.append(table)

    story.append(Spacer(1, 4 * mm))
    story.append(
        Paragraph(
            ascii_safe(
                "Notes: Short/shorts normalized to Short. "
                "Shirt LS/SS match shirt-family ClientPatterns. "
                "'job unlinked' = active pattern job with no client_pattern_id. "
                "'no pattern sheet' = client has no ClientPattern for that garment. "
                "'pattern but no TUD' / 'linked pattern has no TUD' = sheet exists but no .tud attachment. "
                "Fabric-only lines excluded. Cancelled pattern jobs excluded."
            ),
            small,
        )
    )

    doc.build(story)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help=f"PDF output path (default: {DEFAULT_OUT})",
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="Force local JSON instead of Supabase",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        default=None,
        help="Optional JSON dump of rows/meta",
    )
    args = parser.parse_args()

    jobs_doc, lib_doc, so_doc, source_label = load_documents(prefer_local=args.local)
    rows, meta = build_rows(jobs_doc, lib_doc, so_doc)
    write_pdf(args.out, rows, meta, source_label)

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(
            json.dumps({"meta": meta, "rows": rows, "source": source_label}, indent=2)
            + "\n",
            encoding="utf-8",
        )

    answer = "YES" if meta["groups_missing_tud"] or rows else "NO"
    print()
    print("=== Pattern / TUD missing report ===")
    print(f"Answer: {answer} - garment types on active jobs/lines without patterns/TUD")
    print(f"Data source: {source_label}")
    print(
        f"Active pattern jobs: {meta['active_jobs']} "
        f"(cancelled skipped: {meta['cancelled_jobs']})"
    )
    print(
        f"Gap rows: {meta['missing_rows']} "
        f"(jobs: {meta.get('missing_pattern_jobs', 0)}, "
        f"open-SO lines no job: {meta.get('missing_so_lines', 0)})"
    )
    print(
        f"Client+garment groups with no .tud pattern: "
        f"{len(meta['groups_missing_tud'])}"
    )
    print(
        f"Active jobs on those no-TUD groups: {meta.get('jobs_no_client_tud', 0)}"
    )
    print("No-TUD groups by garment:")
    for g, c in sorted(
        meta.get("by_garment_no_tud_group", {}).items(), key=lambda x: (-x[1], x[0])
    ):
        print(f"  {g}: {c}")
    print("All gap rows by garment:")
    for g, c in sorted(meta["by_garment"].items(), key=lambda x: (-x[1], x[0])):
        print(f"  {g}: {c}")
    print("By reason:")
    for g, c in sorted(meta["by_reason"].items(), key=lambda x: (-x[1], x[0])):
        print(f"  {g}: {c}")
    print(f"PDF: {args.out.resolve()}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
