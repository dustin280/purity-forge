## Problem

The previous security hardening migration revoked `EXECUTE` on the counter functions from `authenticated`. But these functions are used as column DEFAULTs or called via RPC by signed-in users, so revoking breaks normal inserts:

- `next_mobile_phase_prep_number()` — DEFAULT on `mobile_phase_prep_log.log_number` → mobile phase prep log save fails (current toast).
- `next_material_receipt_number()` — DEFAULT on `material_receipts.receipt_number` → receipt creation will fail.
- `next_standard_preparation_number()` — DEFAULT on `standard_preparations.log_number` → prep creation will fail.
- `next_syn_id(text, date)` — called via `supabase.rpc("next_syn_id", …)` in batch prep flow → batch prep will fail.

`SECURITY DEFINER` controls whose privileges run inside the function, but the caller still needs `EXECUTE` to invoke it. That is the safe pattern here — the function bodies only touch the small counter tables.

## Fix

One migration that grants `EXECUTE` back to `authenticated` for the four counter functions. Keep `anon` revoked (no anonymous use). Other revokes from the prior migration (`handle_new_user`, `audit_trigger`, role helpers' anon revocation) stay as-is — they don't need caller EXECUTE.

```sql
GRANT EXECUTE ON FUNCTION public.next_mobile_phase_prep_number()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_material_receipt_number()         TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_standard_preparation_number()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_syn_id(text, date)                TO authenticated;
```

Then update `@security-memory` to note that `SECURITY DEFINER` counter helpers backing column DEFAULTs or client RPCs must keep `EXECUTE … TO authenticated` — security comes from the function body + counter-table RLS (`deny_all`), not from revoking EXECUTE.

No app code changes needed.