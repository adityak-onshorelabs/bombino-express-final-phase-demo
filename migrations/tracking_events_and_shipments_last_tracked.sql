-- Tracking persistence: events table + shipments.last_tracked_at
-- Apply in Supabase SQL editor or your migration runner.

CREATE TABLE IF NOT EXISTS tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  awb_number text NOT NULL,
  event_at timestamptz NOT NULL,
  event_type text,
  event_description text,
  event_location text,
  raw_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tracking_events_awb_event_at_key
  ON tracking_events (awb_number, event_at);

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS last_tracked_at timestamptz;
