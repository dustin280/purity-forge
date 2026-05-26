CREATE TABLE public.lab_journal_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  entry_at timestamptz NOT NULL DEFAULT now(),
  title text,
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lab_journal_user_entry_at ON public.lab_journal_entries (user_id, entry_at DESC);

ALTER TABLE public.lab_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY lje_select ON public.lab_journal_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY lje_insert ON public.lab_journal_entries FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY lje_update ON public.lab_journal_entries FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY lje_delete ON public.lab_journal_entries FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER lab_journal_entries_set_updated_at
  BEFORE UPDATE ON public.lab_journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
