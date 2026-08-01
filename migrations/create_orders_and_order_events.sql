-- A3 (Booking) foundation. orders is column-partitioned between the two
-- devs per docs/final-phase/markdowns/final-phase-modules.md §4:
--   [A3] booking columns  — written at order creation (this module)
--   [fulfilment] columns  — written by later modules (M2/M3/M5/A5); left
--                           nullable here, not touched by A3
-- Safe to apply: neither table exists yet.

CREATE SEQUENCE IF NOT EXISTS public.orders_order_no_seq START 100001;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- [A3]
  order_no text NOT NULL UNIQUE
    DEFAULT ('BOM-' || lpad(nextval('public.orders_order_no_seq')::text, 6, '0')),
  user_id uuid NOT NULL REFERENCES public.itd_users(id) ON DELETE CASCADE,
  pickup_request smallint NOT NULL CHECK (pickup_request IN (1, 2)), -- 1 = pickup, 2 = drop-off
  pickup_date date,
  pickup_slot text CHECK (
    pickup_slot IS NULL OR pickup_slot IN ('09:00-12:00', '12:00-15:00', '15:00-18:00', '18:00-21:00')
  ),
  origin_address_id uuid REFERENCES public.addresses(id),
  consignee jsonb NOT NULL,
  items jsonb NOT NULL,
  booked_weight numeric,
  quoted_amount numeric,
  payment_method text NOT NULL CHECK (
    payment_method IN ('pay_now', 'pay_at_pickup', 'pay_at_dropoff', 'cod')
  ),
  payment_status text NOT NULL DEFAULT 'pending', -- A4 owns updates
  is_cod boolean NOT NULL DEFAULT false,

  -- frozen status vocabulary (§3); initial value set by A3 at creation,
  -- all transitions after that belong to the fulfilment lane
  status text NOT NULL DEFAULT 'pickup_requested' CHECK (status IN (
    'pickup_requested', 'agent_accepted', 'out_for_pickup', 'picked_up',
    'awaiting_dropoff', 'received_at_hub', 'weighed', 'settled',
    'ready_for_docket', 'dispatched', 'cancelled'
  )),

  -- [fulfilment]
  agent_id uuid,
  actual_weight numeric,
  final_amount numeric,
  awb_no text,
  itd_docket_response jsonb,

  metadata jsonb, -- escape hatch, per §4

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);

COMMENT ON TABLE public.orders IS
  'A3 booking + fulfilment (M2/M3/M5/A5) order record. Column-partitioned — see file header.';

CREATE TABLE IF NOT EXISTS public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  actor_user_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON public.order_events (order_id);

COMMENT ON TABLE public.order_events IS
  'Insert-only lifecycle log for orders. Written by all modules — no DDL-ownership conflict.';
