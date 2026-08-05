// Client-side pre-upload checks mirroring the storage.buckets limits set in
// supabase/migrations/20260805120100_add_storage_upload_limits.sql. This is a
// UX nicety (fail fast with a clear toast) — the bucket-level limits are the
// real enforcement, since this check can be bypassed by a direct API call.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB, matches the migration

// Only for buckets whose upload UI is a general document/photo picker with no
// format restriction today (coc-attachments, issue-reports,
// lab-journal-attachments, material-receipts, parameter-scouting-attachments).
// Keep in sync with the `allowed_mime_types` list in the migration above.
export const DOCUMENT_MIME_ALLOWLIST = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export class UploadValidationError extends Error {}

/**
 * Throws UploadValidationError with a user-facing message if `file` fails
 * the size check, or the MIME check when `allowedTypes` is provided.
 * Pass no `allowedTypes` for buckets that may receive raw instrument-export
 * formats not covered by DOCUMENT_MIME_ALLOWLIST.
 */
export function assertUploadable(file: File, allowedTypes?: readonly string[]): void {
  if (file.size <= 0) {
    throw new UploadValidationError(`${file.name}: file is empty`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(`${file.name}: exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB upload limit`);
  }
  if (allowedTypes && !allowedTypes.includes(file.type)) {
    throw new UploadValidationError(`${file.name}: file type "${file.type || "unknown"}" is not allowed here`);
  }
}
