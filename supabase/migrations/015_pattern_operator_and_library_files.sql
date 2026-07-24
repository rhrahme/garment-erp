-- Pattern team role: pattern library + drafting queue, clients (contacts hidden),
-- fabric specification. No prices, no orders create, no accounting/HR/sales CRM.
alter type user_role add value if not exists 'pattern_operator';

-- Pattern library attachments (.TUD, .xlsx, .dxf, .pdf, images) reuse the
-- erp-pattern-files bucket under the pattern-library/ prefix — broaden the
-- MIME allowlist so native TUKA/Excel/image uploads are accepted.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/dxf',
  'image/vnd.dxf',
  'application/octet-stream',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic'
]
where id = 'erp-pattern-files';
