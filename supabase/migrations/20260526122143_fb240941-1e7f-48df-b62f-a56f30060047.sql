-- Instruments table
CREATE TABLE public.instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  location text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY instruments_select ON public.instruments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY instruments_admin_write ON public.instruments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER instruments_set_updated_at
  BEFORE UPDATE ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Instrument bookings table
CREATE TABLE public.instrument_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  purpose text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_instrument_bookings_range
  ON public.instrument_bookings (instrument_id, starts_at, ends_at);

ALTER TABLE public.instrument_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ib_select ON public.instrument_bookings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY ib_insert ON public.instrument_bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'tech'::app_role)
      OR public.has_role(auth.uid(), 'reviewer'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY ib_update ON public.instrument_bookings
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY ib_delete ON public.instrument_bookings
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER instrument_bookings_set_updated_at
  BEFORE UPDATE ON public.instrument_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Validate time range and duration
CREATE OR REPLACE FUNCTION public.validate_instrument_booking()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'Booking end must be after start';
  END IF;
  IF NEW.ends_at - NEW.starts_at > interval '14 days' THEN
    RAISE EXCEPTION 'Booking cannot exceed 14 days';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER instrument_bookings_validate
  BEFORE INSERT OR UPDATE ON public.instrument_bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_instrument_booking();

-- Prevent overlapping bookings on the same instrument
CREATE OR REPLACE FUNCTION public.prevent_instrument_booking_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  conflict_row record;
BEGIN
  SELECT id, user_name, starts_at, ends_at
    INTO conflict_row
    FROM public.instrument_bookings
   WHERE instrument_id = NEW.instrument_id
     AND id <> NEW.id
     AND tstzrange(starts_at, ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Time conflict with % (% to %)',
      conflict_row.user_name,
      to_char(conflict_row.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI" UTC"'),
      to_char(conflict_row.ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI" UTC"');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER instrument_bookings_no_overlap
  BEFORE INSERT OR UPDATE ON public.instrument_bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_instrument_booking_overlap();

-- Seed with the instrument referenced elsewhere in the app
INSERT INTO public.instruments (name) VALUES ('Infinity III HPLC-DAD')
  ON CONFLICT (name) DO NOTHING;
INSERT INTO public.instruments (name) VALUES ('Agilent 1290 DAD')
  ON CONFLICT (name) DO NOTHING;