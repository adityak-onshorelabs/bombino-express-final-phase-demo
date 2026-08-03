-- A5 — payment collection mode and transaction id.
--
-- `payments` DDL owner is Aditya per §4. Additive-only: two nullable columns,
-- one sequence, one partial unique index. Nothing renamed, nothing retyped.
--
-- WHY a txn id at all: the agent hands the customer something to quote back,
-- and accounts reconciles cash against it. It has to be readable over a phone
-- in a noisy street, which rules out a random hash.
--
-- Format: TXN-20260803-0042
--   Date is Asia/Kolkata, not UTC — the agents are in India, and a payment
--   taken at 1am IST must reconcile to the day the agent worked, not the
--   previous UTC day.
--   The counter is GLOBAL, not per-day: it does not reset at midnight. Grouping
--   by day still works on the date prefix. A per-day reset would need a
--   function and a lock for no reconciliation benefit.

CREATE SEQUENCE IF NOT EXISTS public.payments_txn_seq START 1;

ALTER TABLE public.payments
  -- How the money physically moved. Distinct from `method`, which is what the
  -- customer chose at booking: a pay_at_pickup order can be settled by either.
  ADD COLUMN IF NOT EXISTS collection_mode text
    CHECK (collection_mode IS NULL OR collection_mode IN ('upi', 'cash')),
  ADD COLUMN IF NOT EXISTS txn_id text;

ALTER TABLE public.payments
  ALTER COLUMN txn_id SET DEFAULT (
    'TXN-'
    || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD')
    || '-'
    || lpad(nextval('public.payments_txn_seq')::text, 4, '0')
  );

-- Partial, so pre-existing rows with a NULL txn_id do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS payments_txn_id_key
  ON public.payments (txn_id) WHERE txn_id IS NOT NULL;

-- The collections screen: this agent's payments, newest first.
CREATE INDEX IF NOT EXISTS payments_collected_by_idx
  ON public.payments (collected_by, collected_at DESC);

COMMENT ON COLUMN public.payments.collection_mode IS
  'How the money moved: upi or cash. Null for gateway payments (A4), which nobody collects by hand.';
COMMENT ON COLUMN public.payments.txn_id IS
  'Human-quotable receipt id, TXN-YYYYMMDD-NNNN, IST date. Counter is global and does not reset daily.';
