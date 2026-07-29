-- Client media gallery: raise size limit for phone videos and broaden MIME allowlist.
-- Images: JPEG/PNG/WebP/HEIC/HEIF (HEIC is converted to JPEG by the ERP before/while serving).
-- Videos: MP4, QuickTime (MOV), WebM, 3GP.
-- Note: project plan caps storage objects at 50 MB (same as erp-pattern-files).

update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/3gpp',
    'video/3gpp2'
  ]
where id = 'erp-client-photos';
