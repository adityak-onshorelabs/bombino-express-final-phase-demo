-- A5 (Pickup Agent) — indexes and the agent_id foreign key.
--
-- Committed because §4 requires every statement to exist as a file in
-- migrations/ regardless of how it reached the database. Fully idempotent:
-- safe to run whether or not this was already applied out of band.
--
-- NOTE: `orders.agent_id` is a FULFILMENT column and belongs to Arbaaz under
-- the column partition in §4. This is A-lane DDL touching a B-lane column —
-- announce before applying.

-- The agent's own queue: WHERE agent_id = ?
CREATE INDEX IF NOT EXISTS orders_agent_id_idx
  ON public.orders (agent_id);

-- The available-pickups list, which is the hot path — every agent polls it.
-- Partial, so the index holds only unclaimed jobs rather than every order
-- that ever existed.
CREATE INDEX IF NOT EXISTS orders_available_pickups_idx
  ON public.orders (created_at)
  WHERE status = 'pickup_requested' AND agent_id IS NULL;

-- agent_id was created as a bare uuid with no referential integrity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_agent_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES public.itd_users(id);
  END IF;
END $$;
