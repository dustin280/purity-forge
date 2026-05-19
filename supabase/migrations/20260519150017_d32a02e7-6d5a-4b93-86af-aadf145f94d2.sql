UPDATE public.chain_of_custody_fields
SET field_type = 'multiselect'
WHERE field_key = 'requested_tests';