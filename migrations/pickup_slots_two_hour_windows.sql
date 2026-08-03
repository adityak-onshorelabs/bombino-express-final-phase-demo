-- Pickup windows: four 3-hour slots -> six 2-hour slots, still 9 AM to 9 PM.
--
--   09:00-11:00  11:00-13:00  13:00-15:00
--   15:00-17:00  17:00-19:00  19:00-21:00
--
-- Two tables carry the vocabulary and they are treated differently on purpose.

-- ── orders: history, preserved ──────────────────────────────────────────────
-- Existing orders were booked into 3-hour windows. That is what the customer
-- actually agreed to, so the rows are left exactly as they are and the CHECK is
-- widened to the union of old and new. Rewriting a booked window to its nearest
-- 2-hour neighbour would be inventing a commitment nobody made.
--
-- The old four are accepted by the DB but are NOT bookable: they are absent
-- from PICKUP_SLOTS in shared/pickupSlots.ts, so every Zod schema and every
-- availability query rejects them. Narrow this CHECK once no legacy order is
-- live.

-- Both CHECKs were declared inline, so Postgres auto-named them. Drop by
-- definition rather than by guessed name, so this runs regardless of what they
-- ended up called.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%pickup_slot%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_pickup_slot_check CHECK (
    pickup_slot IS NULL OR pickup_slot IN (
      -- current
      '09:00-11:00', '11:00-13:00', '13:00-15:00',
      '15:00-17:00', '17:00-19:00', '19:00-21:00',
      -- legacy, historical rows only
      '09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00'
    )
  );

-- ── agent_weekly_availability: config, reset ────────────────────────────────
-- A roster is a forward-looking statement about when someone will work, not a
-- record of anything that happened. The old values no longer name real windows,
-- and mapping them onto new ones would be guesswork: "9 AM - 12 PM" covers one
-- and a half of the new slots, so any mapping either over- or under-commits the
-- agent. Rostering someone into a window they never picked is worse than asking
-- them to pick again, so the rows are cleared and agents re-set their week.
-- "Copy to Mon-Fri" on /agent/schedule makes that a few taps.

DELETE FROM public.agent_weekly_availability;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.agent_weekly_availability'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%slot%'
  LOOP
    EXECUTE format('ALTER TABLE public.agent_weekly_availability DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.agent_weekly_availability
  ADD CONSTRAINT agent_weekly_availability_slot_check CHECK (
    slot IN (
      '09:00-11:00', '11:00-13:00', '13:00-15:00',
      '15:00-17:00', '17:00-19:00', '19:00-21:00'
    )
  );

-- `agent_availability` (per-date) is deprecated and unread — left untouched.
