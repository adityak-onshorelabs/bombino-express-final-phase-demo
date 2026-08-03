-- A5 — agent weekly availability pattern.
--
-- Supersedes `agent_availability` (per-date), which asked agents to tick boxes
-- every single day. Agents work a normal week; they set it once in their
-- profile and it repeats.
--
-- day_of_week uses the JavaScript convention, 0 = Sunday … 6 = Saturday, so it
-- maps straight onto `Date.getUTCDay()` with no off-by-one translation layer.
-- Computing it from a bare `date` is timezone-safe: a calendar date has exactly
-- one weekday regardless of zone.
--
-- NOT BUILT, deliberately: per-date exceptions (leave, sick days). An agent
-- cannot currently opt out of a single Tuesday. That needs an
-- `agent_availability_exceptions` table resolved as `pattern MINUS exceptions`.
-- Flagged in docs/final-phase/markdowns/open-items.md.

CREATE TABLE IF NOT EXISTS public.agent_weekly_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.itd_users(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  slot text NOT NULL CHECK (
    slot IN ('09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT agent_weekly_availability_unique UNIQUE (agent_id, day_of_week, slot)
);

-- The customer-facing question: "is anyone working Tuesdays at 3pm?"
-- At most 7 x 4 x (agent count) rows, so this stays tiny forever.
CREATE INDEX IF NOT EXISTS agent_weekly_availability_dow_idx
  ON public.agent_weekly_availability (day_of_week, slot);

CREATE INDEX IF NOT EXISTS agent_weekly_availability_agent_idx
  ON public.agent_weekly_availability (agent_id);

COMMENT ON TABLE public.agent_weekly_availability IS
  'Each agent''s recurring weekly pattern. A slot is offered to customers when >= 1 agent works that weekday + window. day_of_week: 0 = Sunday .. 6 = Saturday.';

-- `agent_availability` (per-date) is retained rather than dropped: §4 forbids
-- destructive DDL during the phase. Nothing reads it as of this migration.
-- Drop it after the deadline.
COMMENT ON TABLE public.agent_availability IS
  'DEPRECATED — superseded by agent_weekly_availability. No longer read by any code. Safe to drop after the phase.';
