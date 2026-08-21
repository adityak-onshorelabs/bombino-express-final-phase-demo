-- Packaging option — does the customer need us to pack the parcel?
--
-- `orders` booking columns are the A-lane per
-- docs/final-phase/markdowns/final-phase-modules.md §4. Additive-only: one
-- boolean, defaulted, no renames.
--
-- WHY a column rather than `metadata` or a key inside `items`:
--   * `items` is the verbatim ITD docket payload. ITD has no packaging field,
--     and mixing a Bombino fact into it would break the "hand the blob to ITD"
--     property that makes M5 simple.
--   * `metadata` is the escape hatch for facts nobody queries. This one is
--     queried: the agent's job list has to show, before the agent leaves the
--     hub, which jobs need packaging material in the van.
--
-- No price attached at booking. Packaging cost, when it applies, is folded in
-- at the hub via the existing reprice path (actual_weight → final_amount), so
-- `quoted_amount` is unaffected and no fee table is implied here.
--
-- NOT NULL DEFAULT false: every order written before this column existed was
-- booked without packaging, which is exactly what false says.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS packaging_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.packaging_required IS
  'Customer asked Bombino to pack the parcel. Pickup: the agent brings material. Drop-off: the hub counter packs it. Cost, if any, is settled at weigh/settle — never in quoted_amount.';
