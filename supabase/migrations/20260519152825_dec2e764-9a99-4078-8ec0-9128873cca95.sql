UPDATE public.chain_of_custody_fields
SET label = 'Invoice #',
    placeholder = 'Auto-generated (e.g. COC051926-100)',
    field_type = 'text'
WHERE field_key = 'sample_id';