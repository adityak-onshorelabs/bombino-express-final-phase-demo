-- The provider's own request id, kept alongside Meta's message id.
--
-- Tata's send response returns `{"id": "<uuid>"}`, documented as "Request id of
-- the API call" — NOT a Meta `wamid`. Delivery callbacks arrive carrying a
-- `wamid` instead, so the two live in different id spaces and one column cannot
-- hold both. `provider_id` keeps the wamid, because that is what receipts are
-- keyed on; this column keeps the request id, because that is the reference
-- Tata support asks for when a message never arrives.
--
-- Additive only.

alter table public.whatsapp_messages
  add column if not exists request_id text;

create index if not exists whatsapp_messages_request_id
  on public.whatsapp_messages (request_id) where request_id is not null;
