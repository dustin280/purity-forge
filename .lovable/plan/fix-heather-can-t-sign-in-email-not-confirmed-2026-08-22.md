# Fix: Heather can't sign in ("Email not confirmed")

## What's actually wrong

Heather's account was created via **invite** on June 1 and the invite link was never used:

- `email_confirmed_at` = NULL
- `last_sign_in_at` = NULL (she has never successfully signed in)

Supabase blocks password sign-in for unconfirmed accounts and returns `400: Email not confirmed` — which is exactly what the auth logs show. Her password is not the problem; admin password resets don't confirm an email address.

## Immediate fix

Mark her email as confirmed through the Auth admin API and set a known password. She can then sign in at the login page and change it.

## Longer-term fix (so this stops recurring)

Admin-created users already get `email_confirm: true` and can sign in right away. Invited users can't until they click the invite email — which frequently gets lost. Two changes to the Users & Roles admin page:

1. **Show account status per user** — a "Pending invite" vs "Active" badge in the users table, driven by whether the account has confirmed its email, so it's obvious why someone can't log in.
2. **Add an "Activate account" action** on pending users — confirms the email and sets a password immediately, turning a stuck invite into a working login without waiting on email.

## Technical notes

- New admin-only server function in `src/lib/lims/users.functions.ts` using `supabaseAdmin.auth.admin.updateUserById(id, { email_confirm: true, password })`, guarded by `assertAdmin`.
- `listUsers` extended to return per-user `email_confirmed` / `last_sign_in_at` via the Auth admin API (profiles table doesn't carry auth state).
- UI: status badge column plus the activate action in `src/components/users/users-table.tsx`, with a small confirm dialog for the password.
