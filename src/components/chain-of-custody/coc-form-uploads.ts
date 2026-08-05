/**
 * Helper for uploading pending CoC attachments to storage and recording
 * rows in the attachments table. Extracted from `use-coc-form.ts` to
 * keep the hook focused on state/mutation orchestration.
 */
import { supabase } from "@/integrations/supabase/client";
import { assertUploadable, DOCUMENT_MIME_ALLOWLIST } from "@/lib/upload-validation";

type RecordAttachmentFn = (args: {
  data: {
    coc_id: string;
    file_path: string;
    file_name: string;
    content_type: string | null;
    size_bytes: number;
    line_item_index: number | null;
  };
}) => Promise<unknown>;

export async function uploadCocFile(
  cocId: string,
  file: File,
  lineIdx: number | null,
  recordAttachment: RecordAttachmentFn,
) {
  assertUploadable(file, DOCUMENT_MIME_ALLOWLIST);
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${cocId}/${Date.now()}-${safe}`;
  const { error: upErr } = await supabase.storage.from("coc-attachments").upload(path, file);
  if (upErr) throw upErr;
  await recordAttachment({
    data: {
      coc_id: cocId,
      file_path: path,
      file_name: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
      line_item_index: lineIdx,
    },
  });
}

export async function uploadPendingCocAttachments(
  cocId: string,
  topLevel: File[],
  byLine: Record<number, File[]>,
  recordAttachment: RecordAttachmentFn,
) {
  for (const file of topLevel) {
    await uploadCocFile(cocId, file, null, recordAttachment);
  }
  for (const [idx, files] of Object.entries(byLine)) {
    const i = Number(idx);
    for (const file of files) await uploadCocFile(cocId, file, i, recordAttachment);
  }
}