-- WhatsApp outbound message log.
--
-- One row per message we try to send, written BEFORE the provider is called.
-- That ordering is the whole point: `dedupe_key` carries a unique index, so a
-- second attempt at the same message loses the insert and returns without
-- sending. The same transition can be replayed, and the Razorpay webhook is
-- deliberately built to race its own verify call
-- (payments_gateway_reference.sql) — without this, a customer gets the same
-- message twice and we have no record of either.
--
-- Also the only place a delivery failure is visible. Nothing else in the app
-- can tell you a template was paused or a number was unreachable.
--
-- Additive only, per the §4 partition rule. Nothing here touches another
-- table.

create table if not exists public.whatsapp_messages (
  id            uuid primary key default gen_random_uuid(),
  -- Null for messages that belong to no order — the login OTP, the agent's
  -- morning digest.
  order_id      uuid references public.orders(id),
  -- Who we sent it to. Null when the recipient has no account row, which
  -- today means only an OTP to a number that has not signed up yet.
  user_id       uuid references public.itd_users(id),
  -- E.164 without the +, as handed to the provider. Stored as sent rather
  -- than as held, so a normalisation bug is legible from the row.
  to_phone      text not null,
  template      text not null,
  variables     jsonb,
  dedupe_key    text not null,
  -- The provider's message id, which is what delivery receipts arrive keyed on.
  provider_id   text,
  status        text not null default 'queued'
                check (status in ('queued','sent','delivered','read','failed','skipped')),
  error         jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The idempotency control. Not an optimisation — see the header.
create unique index if not exists whatsapp_messages_dedupe_key
  on public.whatsapp_messages (dedupe_key);

-- Receipts arrive with a provider id and nothing else.
create index if not exists whatsapp_messages_provider_id
  on public.whatsapp_messages (provider_id) where provider_id is not null;

-- "What has this order sent?" on the ops board, and "is delivery failing?"
create index if not exists whatsapp_messages_order_id
  on public.whatsapp_messages (order_id) where order_id is not null;
create index if not exists whatsapp_messages_status_created
  on public.whatsapp_messages (status, created_at desc);
