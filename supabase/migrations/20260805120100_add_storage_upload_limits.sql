-- Closes the systemic gap where no attachment bucket enforced a file-size or
-- MIME-type limit at the storage layer (client-side checks alone can be
-- bypassed by a direct API call). Applies a shared 25 MB cap to every known
-- attachment bucket. A MIME allowlist (common lab documents + photos) is
-- applied only to buckets whose upload UI is a general document/photo picker
-- with no format restriction today; buckets that may receive raw
-- instrument-export/proprietary formats (raw-data, openlab-cds,
-- standard-preparations, sample-preparations) keep the size cap only, to
-- avoid rejecting legitimate instrument files sight-unseen.
-- `UPDATE ... WHERE id IN (...)` is a no-op for any bucket id that doesn't
-- exist yet, so this is safe to run regardless of which buckets are present.

UPDATE storage.buckets
SET file_size_limit = 26214400 -- 25 MB
WHERE id IN (
  'coc-attachments', 'issue-reports', 'lab-journal-attachments',
  'material-receipts', 'parameter-scouting-attachments',
  'raw-data', 'openlab-cds', 'standard-preparations', 'sample-preparations'
);

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
WHERE id IN (
  'coc-attachments', 'issue-reports', 'lab-journal-attachments',
  'material-receipts', 'parameter-scouting-attachments'
);
