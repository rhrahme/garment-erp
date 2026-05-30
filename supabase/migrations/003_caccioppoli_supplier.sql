-- Caccioppoli supplier + price list metadata
-- Full fabric catalog (1,268 items) lives in src/data/suppliers/caccioppoli-ss26.json
-- Bulk import to Supabase can be done via scripts/generate-caccioppoli-sql.mjs when needed

insert into suppliers (code, name, country, is_fabric_supplier, lead_time_days)
values ('CACCIOPPOLI', 'Caccioppoli', 'Italy', true, 14)
on conflict (code) do update set name = excluded.name, country = excluded.country;

insert into supplier_price_lists (supplier_id, name, effective_date, currency, notes)
select id, 'SS26 - D', '2026-01-01', 'EUR', 'Imported from Caccioppoli Price list SS26 - D.pdf — 1,268 fabrics'
from suppliers where code = 'CACCIOPPOLI'
on conflict do nothing;

-- Composition key: wv=virgin wool, se=silk, li=linen, co=cotton, pa=polyamide, wo=wool, ea=elastane
