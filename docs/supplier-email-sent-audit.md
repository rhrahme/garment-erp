# Supplier email sent audit

Audited: 2026-08-02T15:32:40.346Z (UTC)
Production: https://erp.hagan.pro
Code fix SHA: `237c148` (Email sent/pending visibility + wipe guards)
fabric_orders document updated_at: 2026-08-02T15:29:24.958+00:00

## Where the notice shows (QC / all teams)

Status only - no email body, recipients, or draft content.

- **Fabric Orders** list (`/fabric-orders`) - Supplier email column
- **Fabric Order detail** (`/fabric-orders/[id]`) - header badge + per-line Email sent / Pending email + summary banner
- **Production / Sales Orders** list (`/orders`) - Supplier email column
- **Order detail** (`/orders/[id]`) - header badge + Supplier email column + summary banner

Labels: **Email sent** | **Email pending** | **Email X/Y** (partial).
Purpose: QC and other teams can remind admin if a supplier email was forgotten.

## What was fixed (2026-08-02)

1. Production Supabase `fabric_orders` was wiped to `{ orders: [] }` earlier on 2026-08-02, so every badge showed `-` even though sales orders still had `fabric_po_ids`.
2. Restored 48 purchase orders from local backup + rebuild from sales-order links + supplier-reply/shipment evidence for sent markers.
3. UI: orders with fabric lines but missing linked POs now show **Email pending** (not blank `-`).
4. Guards: refuse empty `fabric_orders` overwrites in store + Supabase write path.
5. Recovery script: `scripts/restore-wiped-fabric-orders.mjs`.

## Summary counts

### Purchase orders

| Status | Count |
|--------|------:|
| Total | 48 |
| Sent (emailed_at set) | 16 |
| Pending (not emailed) | 32 |

### Sales orders with fabric POs

| Status | Count |
|--------|------:|
| Fully sent | 5 |
| Partial | 7 |
| Pending (nothing sent) | 9 |
| Empty PO stubs | 0 |

## Fully sent

| SO | Client | Code | Line sent | Line pending | POs (supplier / status) |
|----|--------|------|----------:|-------------:|-------------------------|
| SO-2026-0106 | Youssef Al Rashed | FR-0526-0002 | 3 | 0 | PO-2026-0005 (drapers, sent @ 2026-06-10) |
| SO-2026-0119 | Abdelaziz Mohamad Al Ajlan | FR-0726-0039 | 36 | 0 | PO-2026-0001 (loro-piana, sent @ 2026-07-09); PO-2026-0002 (stylbiella, sent @ 2026-07-30); PO-2026-0003 (caccioppoli, sent @ 2026-07-09) |
| SO-2026-0121 | Pr Khaled Bin Salman | FR-0626-0037 | 18 | 0 | PO-2026-0005 (loro-piana, sent @ 2026-07-15) |
| SO-2026-0127 | Abdeliah abou Nayan | FR-0326-0004 | 9 | 0 | PO-2026-0006 (loro-piana, sent @ 2026-07-21); PO-2026-0007 (drapers, sent @ 2026-07-21) |
| SO-2026-0133 | Pr Khaled Bin Salman | FR-0626-0037 | 57 | 0 | PO-2026-0028 (loro-piana, sent @ 2026-07-30) |

## Partial (some lines emailed)

| SO | Client | Code | Line sent | Line pending | POs (supplier / status) |
|----|--------|------|----------:|-------------:|-------------------------|
| SO-2026-0104 | Rakan Al Touq | FR-0626-0032 | 6 | 2 | PO-2026-0001 (caccioppoli, sent @ 2026-06-12); PO-2026-9002 (loro-piana, pending) |
| SO-2026-0105 | Turki Nawaf Al Sudairy | FR-0626-0033 | 5 | 3 | PO-2026-0003 (loro-piana, sent @ 2026-06-12); PO-2026-9002 (drapers, pending) |
| SO-2026-0109 | Abdullah Al Moussa | FR-0226-0024 | 2 | 31 | PO-2026-9001 (caccioppoli, pending); PO-2026-0011 (drapers, sent @ 2026-06-23); PO-2026-9003 (loro-piana, pending); PO-2026-9004 (stylbiella, pending); PO-2026-9005 (unknown, pending) |
| SO-2026-0120 | Ralph Rahme | FR-0126-0019 | 6 | 4 | PO-2026-0004 (caccioppoli, sent @ 2026-07-09); PO-2026-0008 (caccioppoli, pending); PO-2026-0009 (caccioppoli, pending); PO-2026-0010 (caccioppoli, pending); PO-2026-0011 (caccioppoli, pending); PO-2026-0012 (caccioppoli, sent @ 2026-07-30) |
| SO-2026-0125 | Abdelaziz Ajlan Al Ajlan | FR-0726-0038 | 12 | 1 | PO-2026-0013 (loro-piana, sent @ 2026-07-30); PO-2026-0014 (zegna, pending) |
| SO-2026-0130 | Ibrahim Al Shwemi | FR-0726-0037 | 1 | 32 | PO-2026-9001 (loro-piana, pending); PO-2026-0019 (drapers, sent @ 2026-07-30); PO-2026-9003 (zegna, pending); PO-2026-9004 (unknown, pending) |
| SO-2026-0134 | Turki Al Luwaihiq | FR-0726-0060 | 2 | 9 | PO-2026-9001 (caccioppoli, pending); PO-2026-9002 (loro-piana, pending); PO-2026-0025 (gazaba, sent @ 2026-07-31) |

## Pending (not sent - remind admin)

| SO | Client | Code | Line sent | Line pending | POs (supplier / status) |
|----|--------|------|----------:|-------------:|-------------------------|
| SO-2026-0096 | Abdulillah Abdulmohsen Al Sheikh | FR-0526-0027 | 0 | 11 | PO-2026-9001 (caccioppoli, pending); PO-2026-9002 (drapers, pending); PO-2026-9003 (loro-piana, pending); PO-2026-9004 (stylbiella, pending) |
| SO-2026-0111 | Pr Khaled Bin Salman | FR-0626-0037 | 0 | 27 | PO-2026-9001 (caccioppoli, pending) |
| SO-2026-0113 | Pr Khaled Bin Salman | FR-0626-0037 | 0 | 21 | PO-2026-9001 (loro-piana, pending); PO-2026-9002 (unknown, pending) |
| SO-2026-0116 | Pr Khaled Bin Salman | FR-0626-0037 | 0 | 68 | PO-2026-9001 (loro-piana, pending) |
| SO-2026-0117 | Ibrahim Al Shwemi | FR-0726-0037 | 0 | 18 | PO-2026-9001 (caccioppoli, pending) |
| SO-2026-0118 | Abdelaziz Ajlan Ajlan | FR-0726-0038 | 0 | 11 | PO-2026-9001 (caccioppoli, pending); PO-2026-9002 (loro-piana, pending) |
| SO-2026-0131 | Pr Khaled Bin Salman | FR-0626-0037 | 0 | 18 | PO-2026-0015 (zegna, pending); PO-2026-9001 (zegna, pending) |
| SO-2026-0132 | Ralph Rahme | FR-0126-0019 | 0 | 7 | PO-2026-9001 (loro-piana, pending); PO-2026-9002 (unknown, pending) |
| SO-2026-0135 | Abdallah Al Luwaihiq | FR-0726-0059 | 0 | 5 | PO-2026-9001 (loro-piana, pending) |

## Empty PO stubs

_None._

## Sent purchase orders (detail)

| PO | Supplier | emailed_at | Client reference | Lines |
|----|----------|------------|------------------|------:|
| PO-2026-0025 | gazaba | 2026-07-31T07:28:23.000Z | FR-0726-0060-SO-2026-0134 | 2 |
| PO-2026-0028 | loro-piana | 2026-07-30T13:56:10.000Z | FR-0626-0037-SO-2026-0133 | 57 |
| PO-2026-0012 | caccioppoli | 2026-07-30T09:37:27.000Z | FR-0126-0019-SO-2026-0120 | 1 |
| PO-2026-0019 | drapers | 2026-07-30T08:43:35.000Z | FR-0726-0037-SO-2026-0130 | 1 |
| PO-2026-0013 | loro-piana | 2026-07-30T08:10:47.000Z | FR-0726-0038-SO-2026-0125 | 12 |
| PO-2026-0002 | stylbiella | 2026-07-30T03:02:47.000Z | FR-0726-0039-SO-2026-0119 | 2 |
| PO-2026-0006 | loro-piana | 2026-07-21T22:28:55.493Z | FR-0326-0004-SO-2026-0127 | 5 |
| PO-2026-0007 | drapers | 2026-07-21T18:17:45.411Z | FR-0326-0004-SO-2026-0127 | 4 |
| PO-2026-0005 | loro-piana | 2026-07-15T10:29:58.660Z | FR-0626-0037-SO-2026-0121 | 18 |
| PO-2026-0004 | caccioppoli | 2026-07-09T19:45:04.774Z | FR-0126-0019-SO-2026-0120 | 5 |
| PO-2026-0003 | caccioppoli | 2026-07-09T13:48:45.349Z | FR-0726-0039-SO-2026-0119 | 2 |
| PO-2026-0001 | loro-piana | 2026-07-09T13:45:00.501Z | FR-0726-0039-SO-2026-0119 | 32 |
| PO-2026-0011 | drapers | 2026-06-23T19:20:29.197Z | FR-0226-0024-SO-2026-0109 | 2 |
| PO-2026-0001 | caccioppoli | 2026-06-12T14:03:31.000Z | FR-0626-0032-SO-2026-0104 | 6 |
| PO-2026-0003 | loro-piana | 2026-06-12T07:08:47.000Z | FR-0626-0033-SO-2026-0105 | 5 |
| PO-2026-0005 | drapers | 2026-06-10T17:04:12.000Z | FR-0526-0002-SO-2026-0106 | 3 |

## Pending purchase orders (detail)

| PO | Supplier | Client reference | Lines | PO id |
|----|----------|------------------|------:|-------|
| PO-2026-0008 | caccioppoli | FR-0126-0019-SO-2026-0120 | 1 | po-1784705305897-ntettd |
| PO-2026-0009 | caccioppoli | FR-0126-0019-SO-2026-0120 | 1 | po-1784705457679-e3ykzs |
| PO-2026-0010 | caccioppoli | FR-0126-0019-SO-2026-0120 | 1 | po-1784705523037-iqvhxt |
| PO-2026-0011 | caccioppoli | FR-0126-0019-SO-2026-0120 | 1 | po-1784705601949-uh42zg |
| PO-2026-0014 | zegna | FR-0726-0038-SO-2026-0125 | 1 | po-1785088274414-kb7vxi |
| PO-2026-0015 | zegna | FR-0626-0037-SO-2026-0131 | 5 | po-1785094704356-ek8nrh |
| PO-2026-9001 | loro-piana | FR-0726-0059-SO-2026-0135 | 5 | po-1785349243362-wxo13q |
| PO-2026-9001 | caccioppoli | FR-0726-0060-SO-2026-0134 | 1 | po-1785349325999-bjia7v |
| PO-2026-9001 | loro-piana | FR-0126-0019-SO-2026-0132 | 7 | po-1785232569611-a1tx00 |
| PO-2026-9001 | zegna | FR-0626-0037-SO-2026-0131 | 13 | po-1785232668506-scrmea |
| PO-2026-9001 | loro-piana | FR-0726-0037-SO-2026-0130 | 28 | po-1785232728459-7cz3up |
| PO-2026-9001 | caccioppoli | FR-0726-0038-SO-2026-0118 | 2 | po-1783295479747-n0jzt4 |
| PO-2026-9001 | caccioppoli | FR-0726-0037-SO-2026-0117 | 18 | po-1783296704913-kbrmyl |
| PO-2026-9001 | loro-piana | FR-0626-0037-SO-2026-0116 | 68 | po-1783030651405-g1ekcn |
| PO-2026-9001 | loro-piana | FR-0626-0037-SO-2026-0113 | 21 | po-1782862878831-40fi0y |
| PO-2026-9001 | caccioppoli | FR-0626-0037-SO-2026-0111 | 27 | po-1782860964252-ukqg1m |
| PO-2026-9001 | caccioppoli | FR-0226-0024-SO-2026-0109 | 10 | po-1781828972885-te83l0 |
| PO-2026-9001 | caccioppoli | FR-0526-0027-SO-2026-0096 | 4 | po-1780083989702 |
| PO-2026-9002 | loro-piana | FR-0726-0060-SO-2026-0134 | 8 | po-1785349326000-8ene3y |
| PO-2026-9002 | unknown | FR-0126-0019-SO-2026-0132 | 0 | po-1785349386836-c72c8t |
| PO-2026-9002 | loro-piana | FR-0726-0038-SO-2026-0118 | 9 | po-1783295479748-gxxfj9 |
| PO-2026-9002 | unknown | FR-0626-0037-SO-2026-0113 | 0 | po-1782862878832-t56vcf |
| PO-2026-9002 | drapers | FR-0626-0033-SO-2026-0105 | 3 | po-1781098785702-5ugfq2 |
| PO-2026-9002 | loro-piana | FR-0626-0032-SO-2026-0104 | 2 | po-1781090671829-n32bgj |
| PO-2026-9002 | drapers | FR-0526-0027-SO-2026-0096 | 4 | po-1780083989703 |
| PO-2026-9003 | zegna | FR-0726-0037-SO-2026-0130 | 4 | po-1785232728460-r5pvbf |
| PO-2026-9003 | loro-piana | FR-0226-0024-SO-2026-0109 | 12 | po-1781828972886-xnvns0 |
| PO-2026-9003 | loro-piana | FR-0526-0027-SO-2026-0096 | 1 | po-1780083989705 |
| PO-2026-9004 | unknown | FR-0726-0037-SO-2026-0130 | 0 | po-1785349643218-2yv3s1 |
| PO-2026-9004 | stylbiella | FR-0226-0024-SO-2026-0109 | 9 | po-1781828972886-yg5tp4 |
| PO-2026-9004 | stylbiella | FR-0526-0027-SO-2026-0096 | 2 | po-1780083989704 |
| PO-2026-9005 | unknown | FR-0226-0024-SO-2026-0109 | 0 | po-1781829956849-solbiati |

## Notes

- Some rebuilt POs were marked sent when supplier replies or shipments referenced the PO id.
- Orders without reply/shipment evidence stay **pending** even if admin may have emailed earlier (safer than false sent).
- SO-2026-0116 historically had a partial send; without line-level proof it shows as pending after rebuild.
- Hard refresh after deploy: https://erp.hagan.pro/fabric-orders?v=email-audit
