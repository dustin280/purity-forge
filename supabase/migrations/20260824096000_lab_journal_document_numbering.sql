-- Lab Journal rollout of the shared document numbering system (see
-- 20260824090000_document_numbering_system.sql). Entries never had any
-- number at all -- adds entry_number carrying SYN-JRNL-######-MMDDYY.

ALTER TABLE public.lab_journal_entries ADD COLUMN IF NOT EXISTS entry_number text;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, entry_at FROM public.lab_journal_entries ORDER BY entry_at, created_at LOOP
    UPDATE public.lab_journal_entries
    SET entry_number = public.register_document('JRNL', 'lab_journal_entries', r.id, r.entry_at::date)
    WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.lab_journal_entries ALTER COLUMN entry_number SET NOT NULL;
ALTER TABLE public.lab_journal_entries ADD CONSTRAINT lab_journal_entries_entry_number_key UNIQUE (entry_number);
