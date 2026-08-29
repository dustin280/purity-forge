-- Per-vial photos. coc_attachments could previously only be keyed to a
-- LINE ITEM (line_item_index), which under the three-level hierarchy is the
-- lot -- so every vial of a lot resolved to the same photo. Each vial is a
-- distinct physical object and needs its own image: it's what the partner's
-- deliverable shows, and what gets pulled in at result entry.
--
-- Resolution order in findVialPhotoAttachment becomes:
--   1. exact (line_item_index, vial_no)  -- this vial's own photo
--   2. line_item_index, vial_no IS NULL  -- a lot-wide photo
--   3. line_item_index IS NULL           -- a whole-package/CoC photo
ALTER TABLE public.coc_attachments
  ADD COLUMN IF NOT EXISTS vial_no integer;

CREATE INDEX IF NOT EXISTS coc_attachments_coc_line_vial_idx
  ON public.coc_attachments (coc_id, line_item_index, vial_no);
