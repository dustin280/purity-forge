-- Per-recipient opt-in flags for the daily digest report -- a separate
-- concept from notify_email/notify_sms, which gate the existing
-- event-driven new-intake/incubation-ready alerts. Default false so no
-- existing recipient is auto-enrolled into a brand-new report.
ALTER TABLE public.notification_recipients
  ADD COLUMN IF NOT EXISTS digest_samples_received boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS digest_samples_due boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS digest_due_today boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS digest_sterility_readout boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS digest_endotoxin_due boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS digest_heavy_metals boolean NOT NULL DEFAULT false;
