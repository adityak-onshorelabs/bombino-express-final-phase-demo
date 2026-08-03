-- A5 — agent pickup availability (rosters).
--
-- NEW TABLE, A-lane. Not in the original module spec: booking previously
-- offered all four windows unconditionally, with no notion of whether anyone
-- was working. Flag to Arbaaz — it changes what M1's slot config endpoint
-- should return.
--
-- Model: agents opt in per date + slot. A slot is offered to a customer if at
-- least one agent has opted into it. There is deliberately NO capacity column:
-- one opted-in agent means the window is open, however many orders land in it.
-- If overbooking becomes a problem, add `capacity int` here and sum it against
-- the order count; the shape does not have to change.

CREATE TABLE IF NOT EXISTS public.agent_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.itd_users(id) ON DELETE CASCADE,
  date date NOT NULL,
  slot text NOT NULL CHECK (
    slot IN ('09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One row per agent per window. Makes the agent's "save my day" a plain
  -- delete-then-insert with no risk of duplicates, and makes a double-tap
  -- on the toggle harmless.
  CONSTRAINT agent_availability_unique UNIQUE (agent_id, date, slot)
);

-- The customer-facing question: "who is working this date?" Answered for a
-- whole month at a time when the date picker renders, so it must be cheap.
CREATE INDEX IF NOT EXISTS agent_availability_date_idx
  ON public.agent_availability (date, slot);

-- The agent-facing question: "what did I sign up for?"
CREATE INDEX IF NOT EXISTS agent_availability_agent_idx
  ON public.agent_availability (agent_id, date);

COMMENT ON TABLE public.agent_availability IS
  'Which pickup windows each agent will work, per date. A slot is offered to customers when >= 1 agent has a row. No capacity ceiling by design.';
