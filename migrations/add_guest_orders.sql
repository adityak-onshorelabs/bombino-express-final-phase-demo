-- Guest bookings: an order placed against a verified phone number, with a
-- full KYC set, by someone who has not opened an account.
--
-- Additive and idempotent. One existing constraint is relaxed
-- (orders.user_id NOT NULL); nothing is dropped and no existing row changes
-- meaning.
--
-- Run AFTER create_orders_and_order_events.sql, kyc_persist_foundation.sql and
-- add_account_categories_and_documents.sql.
--
-- ── The shape ──────────────────────────────────────────────────────────────
--
-- A guest is NOT a user row. `guest_ref` is the same uuid the signup flow
-- already uses as `signup_ref` to stage documents before an account exists:
-- account_documents and identity_verifications both key on it, both are
-- authorised by a recently verified phone rather than a session, and neither
-- needs to change here. A guest booking is that same staging, stopped one step
-- short — the documents are produced and checked, the account never is.
--
-- So the guest's identity lives exactly where an in-flight signup's does. What
-- is new is only:
--
--   1. orders may belong to a guest_ref instead of a user_id, and carries the
--      contact details that would otherwise have come off the account.
--   2. kyc_documents — the one table customs reads — may likewise be owned by
--      a guest_ref, because a guest order still has to produce `kyc_details`
--      and `shipper_gstin_no` when ops dockets it.
--
-- ── Claiming ───────────────────────────────────────────────────────────────
--
-- guest_phone is the join key. If that number later opens an account, its
-- guest orders are attached to it: user_id set, guest_ref left in place as the
-- record of how the order arrived. Nothing is deleted by claiming, so a failed
-- claim is repeatable rather than lossy.

-- ── orders ─────────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_ref uuid,
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS guest_phone text;

-- An order belongs to somebody. Exactly which of the two is allowed to be
-- absent, but not both — an order owned by nobody has no consignor to put on a
-- docket and no one to contact about a held parcel.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_owner_present'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_owner_present
      CHECK (user_id IS NOT NULL OR guest_ref IS NOT NULL);
  END IF;
END $$;

-- A guest order carries its own contact details, because there is no account
-- row to read them off. Enforced only for guest orders: an account order
-- leaves all three null and reads them from itd_users, as it always has.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_guest_contact_present'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_guest_contact_present
      CHECK (
        guest_ref IS NULL
        OR (guest_name IS NOT NULL AND guest_phone IS NOT NULL)
      );
  END IF;
END $$;

-- The claim lookup: every unclaimed guest order for one number.
CREATE INDEX IF NOT EXISTS orders_guest_phone_unclaimed_idx
  ON public.orders (guest_phone, created_at DESC)
  WHERE user_id IS NULL AND guest_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_guest_ref_idx
  ON public.orders (guest_ref) WHERE guest_ref IS NOT NULL;

COMMENT ON COLUMN public.orders.guest_ref IS
  'The staging ref this order''s identity documents were produced under — the same uuid the signup flow uses as signup_ref, in account_documents and identity_verifications. NULL for an order booked by an account. Left in place after claiming, as the record of how the order arrived.';
COMMENT ON COLUMN public.orders.guest_phone IS
  'The verified number that authorised this guest booking, and the key a later signup claims by. NULL for an account order, which reads the number off itd_users.';
COMMENT ON COLUMN public.orders.user_id IS
  'The account that booked this order. NULL while the order belongs to a guest — see guest_ref. Set, and never unset, when a guest order is claimed.';

-- ── addresses ──────────────────────────────────────────────────────────────
-- The pickup address. Ops and the agent app read it through
-- orders.origin_address_id, so a guest booking needs a real row here rather
-- than the address folded into the order as JSON — otherwise every consumer of
-- a pickup address grows a second code path for one kind of order.
ALTER TABLE public.addresses
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS guest_ref uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.addresses'::regclass AND conname = 'addresses_owner_present'
  ) THEN
    ALTER TABLE public.addresses
      ADD CONSTRAINT addresses_owner_present
      CHECK (user_id IS NOT NULL OR guest_ref IS NOT NULL);
  END IF;
END $$;

-- findOrCreateAddress dedupes on (owner, type, phone, pincode); this is the
-- guest half of that lookup.
CREATE INDEX IF NOT EXISTS addresses_guest_ref_idx
  ON public.addresses (guest_ref) WHERE guest_ref IS NOT NULL;

COMMENT ON COLUMN public.addresses.guest_ref IS
  'Owns this address when a guest produced it, in place of user_id. Claimed with the order it belongs to when that number opens an account.';

-- ── payments ───────────────────────────────────────────────────────────────
-- A guest pays like anyone else: a gateway payment at booking, or cash to the
-- agent at pickup. The row has to be able to name them.
ALTER TABLE public.payments
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS guest_ref uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.payments'::regclass AND conname = 'payments_owner_present'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_owner_present
      CHECK (user_id IS NOT NULL OR guest_ref IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payments_guest_ref_idx
  ON public.payments (guest_ref) WHERE guest_ref IS NOT NULL;

COMMENT ON COLUMN public.payments.guest_ref IS
  'Owns this payment when a guest made it, in place of user_id. The order it settles carries the same ref.';

-- ── kyc_documents ──────────────────────────────────────────────────────────
-- The one KYC document of record, read by buildItdKycPayload when a docket is
-- generated. A guest order needs one as much as an account order does, so this
-- table gains the same either/or ownership account_documents already has.
ALTER TABLE public.kyc_documents
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.kyc_documents
  ADD COLUMN IF NOT EXISTS guest_ref uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.kyc_documents'::regclass AND conname = 'kyc_documents_owner_present'
  ) THEN
    ALTER TABLE public.kyc_documents
      ADD CONSTRAINT kyc_documents_owner_present
      CHECK (user_id IS NOT NULL OR guest_ref IS NOT NULL);
  END IF;
END $$;

-- One document per guest, mirroring kyc_documents_user_id_key. Partial for the
-- same reason that one is: the column it keys on is now nullable.
CREATE UNIQUE INDEX IF NOT EXISTS kyc_documents_guest_ref_key
  ON public.kyc_documents (guest_ref) WHERE guest_ref IS NOT NULL;

COMMENT ON COLUMN public.kyc_documents.guest_ref IS
  'Owns this row when a guest produced it. Mutually exclusive with user_id in practice, though a claim sets user_id and leaves this in place. NULL for every row written before guest booking existed.';
