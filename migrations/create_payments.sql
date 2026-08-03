-- A4 (Payments) table, created early because A5 needs it.
--
-- `payments` DDL owner is Aditya per docs/final-phase/markdowns/final-phase-modules.md §4,
-- so this is in-lane. Created here rather than on A4's day (D9) because
-- pay-at-pickup collection is an A5 requirement and had nothing to write to.
--
-- Written by: A5 (agent, at the door) · M3 (ops, at the hub counter)
--             · A4 (Razorpay, at booking)
-- Read by:    M3, A4, A6
--
-- COD never produces a row here — it is a flag on the order, never collected
-- by us (§4 of roles-and-flows). An order with no payments row is not
-- necessarily unpaid.

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- The customer the money relates to, not the person who took it.
  user_id uuid NOT NULL REFERENCES public.itd_users(id) ON DELETE CASCADE,

  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'INR',

  -- Mirrors orders.payment_method minus 'cod', which is never collected.
  method text NOT NULL CHECK (
    method IN ('pay_now', 'pay_at_pickup', 'pay_at_dropoff')
  ),
  status text NOT NULL DEFAULT 'collected' CHECK (
    status IN ('pending', 'collected', 'failed', 'refund_due', 'refunded')
  ),

  -- Staff member who physically took the money (agent or ops). Null for
  -- gateway payments, which nobody collects by hand.
  collected_by uuid REFERENCES public.itd_users(id),
  collected_at timestamptz,

  -- Gateway payment id, or a hand-written receipt number for cash.
  reference text,

  metadata jsonb, -- escape hatch, per §4

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_order_id_idx ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments (user_id);

COMMENT ON TABLE public.payments IS
  'Money collected against an order. COD produces no row — it is a flag only. See §4.';
