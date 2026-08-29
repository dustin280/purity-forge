-- Per-field default values for Sample Receipt.
--
-- The receiving lab is us, every single time, but it was being retyped on
-- every intake. Rather than hardcoding "Synthesyx" in the form, defaults
-- become a property of the field itself so they stay editable from the CoC
-- Fields admin screen without a deploy. The default only seeds a NEW blank
-- receipt -- it never overwrites a resumed draft or an existing record.
ALTER TABLE public.chain_of_custody_fields
  ADD COLUMN IF NOT EXISTS default_value text;

UPDATE public.chain_of_custody_fields
   SET default_value = 'Synthesyx'
 WHERE field_key = 'receiving_lab'
   AND default_value IS NULL;

-- A client phone number is nice to have, not something to block an intake
-- on: the sample is physically on the bench either way, and a receipt that
-- can't be saved is worse than one missing a phone number.
UPDATE public.chain_of_custody_fields
   SET is_required = false
 WHERE field_key = 'client_contact_phone';
