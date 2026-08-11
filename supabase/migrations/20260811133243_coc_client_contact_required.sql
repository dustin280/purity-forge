-- Client contact info at Sample Receipt was optional, which let intake
-- through with no way to reach the client for follow-up questions on a
-- sample. Require the same three fields that already auto-fill from the
-- client picker.
UPDATE public.chain_of_custody_fields
SET is_required = true
WHERE field_key IN ('client_contact_name', 'client_contact_email', 'client_contact_phone');
