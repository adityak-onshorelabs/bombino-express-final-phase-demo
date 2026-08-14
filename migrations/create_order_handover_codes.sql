-- Handover OTPs — the code one party reads out and the other types in.
--
-- Three handovers, three codes, three different pairs of hands:
--
--   kind      shown to    typed in by   gates
--   pickup    customer    agent         out_for_pickup -> picked_up
--   hub       agent       ops           picked_up      -> received_at_hub
--   dropoff   customer    ops           awaiting_dropoff -> received_at_hub
--
-- WHY A TABLE, not `orders.metadata`. The metadata blob is returned wholesale
-- to the agent app (`agentDb.ORDER_COLUMNS` selects it) and to the ops console.
-- A pickup code sitting in there would be readable by the very person it is
-- supposed to test, which is the whole point of the code. A separate table is
-- only ever selected by the endpoint that serves the party entitled to see it.
--
-- The code is stored in plain text, deliberately. A hash would let us verify
-- but never re-display, and the customer has to be able to open the app again
-- when the agent actually arrives — possibly days later. The protection is
-- access control at the API, not secrecy from our own database.
--
-- DDL owner: Aditya (A5 lane — the agent handover is what this exists for).
-- Additive: new table, no changes to anything that already exists.

CREATE TABLE IF NOT EXISTS public.order_handover_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  kind text NOT NULL CHECK (kind IN ('pickup', 'hub', 'dropoff')),
  code text NOT NULL,

  -- Wrong guesses since the code was last issued. A locked code is not a dead
  -- end: whoever the code belongs to can regenerate it, which resets this.
  attempts smallint NOT NULL DEFAULT 0,

  verified_at timestamptz,
  -- Who typed it in correctly: the agent at the door, or ops at the counter.
  verified_by uuid REFERENCES public.itd_users(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One live code per handover per order. Regeneration overwrites the row
  -- rather than adding a second one, so there is never a question of which of
  -- two codes the customer is looking at.
  CONSTRAINT order_handover_codes_unique UNIQUE (order_id, kind)
);

CREATE INDEX IF NOT EXISTS order_handover_codes_order_idx
  ON public.order_handover_codes (order_id);

COMMENT ON TABLE public.order_handover_codes IS
  'Per-order handover OTPs. kind: pickup (customer->agent), hub (agent->ops), dropoff (customer->ops). Never expose a code to the party that types it in.';

COMMENT ON COLUMN public.order_handover_codes.code IS
  'Plain text by design — the owner must be able to re-read it days later. Protected by API access control, not by hashing.';
