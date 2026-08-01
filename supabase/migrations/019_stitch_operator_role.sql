-- Stitch floor kiosk: badge/A4 sewing scans only; no factory-wide or pricing access.
alter type user_role add value if not exists 'stitch_operator';
