-- A4 — gateway payment idempotency.
--
-- `payments` DDL owner is Aditya per §4. Additive-only: one partial unique
-- index. Nothing renamed, nothing retyped, no column added.
--
-- WHY: a Razorpay payment reaches us twice by design — once from the browser
-- on POST /api/payments/razorpay/verify, and again from the webhook, which
-- Razorpay retries on any non-2xx for hours. Both paths write the same
-- payment id into `reference`. The application checks for an existing row
-- first, but a check-then-insert has a window, and the two paths can land
-- inside it: the customer's browser returns from the modal at the same moment
-- the webhook fires. This index closes the window — the loser gets 23505 and
-- re-reads the winner's row instead of double-crediting the order.
--
-- Scoped to method = 'pay_now' because `reference` means two different things
-- in this table: a gateway payment id on a pay_now row, a hand-written receipt
-- number on a cash row (see payments_collection_mode_and_txn_id.sql). Receipt
-- books are not globally unique and must not be forced to be.

CREATE UNIQUE INDEX IF NOT EXISTS payments_gateway_reference_key
  ON public.payments (reference)
  WHERE method = 'pay_now' AND reference IS NOT NULL;

COMMENT ON INDEX public.payments_gateway_reference_key IS
  'One row per Razorpay payment id. Makes the verify call and the webhook idempotent against each other.';
