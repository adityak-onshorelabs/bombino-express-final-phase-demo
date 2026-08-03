-- A2 (company signup): ITD attribution context.
--
-- `itd_users` is Aditya's table per docs/final-phase/markdowns/final-phase-modules.md §4,
-- so this DDL sits in the A-lane. Additive-only: one nullable column, no
-- renames, no type changes.
--
-- Why a JSONB escape hatch rather than real columns: §7 (docket attribution)
-- is still unresolved. `add_customer` today returns no customer id — only an
-- echo of the request — so we do not yet know the shape of the identity M5
-- will need. Stash what ITD gave us verbatim, promote to typed columns once
-- Anas confirms which of the three resolutions applies.

ALTER TABLE public.itd_users
  ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMENT ON COLUMN public.itd_users.metadata IS
  'Escape hatch, per §4. Company signup writes itd_registered / itd_customer_id / itd_add_customer_response here for M5 docket attribution.';
